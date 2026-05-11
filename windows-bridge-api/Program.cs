using System.IO;
using System.DirectoryServices.AccountManagement;
using Microsoft.AspNetCore.StaticFiles;
using System.Security.AccessControl;
using System.Security.Principal;

// Visual Studio can inject a random port into ASPNETCORE_URLS (e.g. 5041), which wins over
// launchSettings. WebHost.UseUrls is ignored when that env var is set — so set it in Development.
var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
if (string.Equals(env, "Development", StringComparison.OrdinalIgnoreCase))
{
    Environment.SetEnvironmentVariable("ASPNETCORE_URLS", "http://0.0.0.0:5200");
}

var builder = WebApplication.CreateBuilder(args);

// Slow ngrok / mobile uploads can trip Kestrel's default minimum body data rate and abort mid-request.
builder.WebHost.ConfigureKestrel((ctx, opts) =>
{
    opts.Limits.MinRequestBodyDataRate = null;
    opts.Limits.MinResponseDataRate = null;
});

// Add services to the container.
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Only enable HTTPS redirect outside Development. In Dev, the http profile (localhost:5200)
// is often used alone; redirecting to https:7097 breaks tests and can confuse which URL works.
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// First route: confirm the correct executable is running (if this 404s, wrong port or app).
app.MapGet("/", () => Results.Text("inyatsi-windows-bridge-api OK\r\n", "text/plain"));

static FileAccessPermissions GetBasicPermissions(string path, string? username = null, HashSet<string>? userGroups = null)
{
    return WindowsAclPermissions.GetBasicPermissions(path, username, userGroups);
}

static HashSet<string> GetUserLocalGroups(string username)
{
    var groups = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    try
    {
        using var context = new PrincipalContext(ContextType.Machine);
        using var user = FindLocalUser(context, username);
        if (user == null) return groups;

        foreach (var principal in user.GetAuthorizationGroups())
        {
            var name = principal?.SamAccountName;
            if (!string.IsNullOrWhiteSpace(name))
            {
                groups.Add(name.Trim());
            }
        }
    }
    catch
    {
        /* ignore for now */
    }
    return groups;
}

static string NormalizeUsername(string username)
{
    var value = (username ?? "").Trim();
    if (string.IsNullOrWhiteSpace(value)) return "";
    if (value.Contains('\\')) value = value.Split('\\', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? value;
    if (value.Contains('@')) value = value.Split('@', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? value;
    return value.Trim();
}

static UserPrincipal? FindLocalUser(PrincipalContext context, string username)
{
    var normalized = NormalizeUsername(username);
    if (string.IsNullOrWhiteSpace(normalized)) return null;

    return UserPrincipal.FindByIdentity(context, IdentityType.SamAccountName, normalized)
        ?? UserPrincipal.FindByIdentity(context, normalized);
}

static string GetDepartmentUsersGroupName(string departmentName)
{
    return $"{departmentName}_Users";
}

static string ToDepartmentId(string value)
{
    return (value ?? "").Trim().ToLowerInvariant().Replace(" ", "_");
}

static bool TryGetDirectories(string path, out string[] directories)
{
    directories = Array.Empty<string>();
    try
    {
        directories = Directory.GetDirectories(path);
        return true;
    }
    catch (UnauthorizedAccessException)
    {
        return false;
    }
    catch (DirectoryNotFoundException)
    {
        return false;
    }
    catch (IOException)
    {
        return false;
    }
}

static bool TryGetFiles(string path, out string[] files)
{
    files = Array.Empty<string>();
    try
    {
        files = Directory.GetFiles(path);
        return true;
    }
    catch (UnauthorizedAccessException)
    {
        return false;
    }
    catch (DirectoryNotFoundException)
    {
        return false;
    }
    catch (IOException)
    {
        return false;
    }
}

static (string Name, string Path)? ResolveDepartmentDirectory(string rootPath, string requestedDepartment)
{
    if (string.IsNullOrWhiteSpace(rootPath) || string.IsNullOrWhiteSpace(requestedDepartment))
    {
        return null;
    }

    try
    {
        rootPath = Path.GetFullPath(rootPath);
    }
    catch
    {
        return null;
    }

    if (!Directory.Exists(rootPath))
    {
        return null;
    }

    var requested = requestedDepartment.Trim();
    var requestedId = ToDepartmentId(requested);

    var tried = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var raw in new[] { requested, requestedId, requested.Replace('_', ' '), requestedId.Replace('_', ' ') })
    {
        var cand = raw.Trim();
        if (string.IsNullOrEmpty(cand) || !tried.Add(cand))
        {
            continue;
        }

        string combined;
        try
        {
            combined = Path.GetFullPath(Path.Combine(rootPath, cand));
        }
        catch
        {
            continue;
        }

        if (!IsPathUnderRoot(rootPath, combined))
        {
            continue;
        }

        try
        {
            if (!Directory.Exists(combined))
            {
                continue;
            }
        }
        catch
        {
            continue;
        }

        var leaf = Path.GetFileName(combined.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        return (leaf, combined);
    }

    if (!TryGetDirectories(rootPath, out var dirs))
    {
        return null;
    }

    foreach (var dir in dirs)
    {
        var name = Path.GetFileName(dir);
        if (string.Equals(name, requested, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(ToDepartmentId(name), requestedId, StringComparison.OrdinalIgnoreCase))
        {
            return (name, dir);
        }
    }

    return null;
}

static bool IsPathUnderRoot(string rootPath, string targetPath)
{
    var normalizedRoot = Path.GetFullPath(rootPath)
        .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    var normalizedTarget = Path.GetFullPath(targetPath);
    return normalizedTarget.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase)
        || normalizedTarget.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
}

static string ResolveRequestedDepartment(HttpRequest request, string? department)
{
    var requested = (department ?? "").Trim();
    if (!string.IsNullOrWhiteSpace(requested))
    {
        return requested;
    }

    var fromHeader = request.Headers["x-org-id"].FirstOrDefault();
    return (fromHeader ?? "").Trim();
}

static bool UserHasAdministrativeAccess(HashSet<string> userGroups)
{
    return userGroups.Contains("Administrators") || userGroups.Contains("FileServer_Admins");
}

static bool CanUserAccessDepartment(string? username, string departmentName, out HashSet<string> userGroups)
{
    userGroups = string.IsNullOrWhiteSpace(username)
        ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        : GetUserLocalGroups(username);

    if (userGroups.Count == 0) return string.IsNullOrWhiteSpace(username);
    if (UserHasAdministrativeAccess(userGroups)) return true;

    var expectedGroup = GetDepartmentUsersGroupName(departmentName);
    return userGroups.Contains(expectedGroup);
}

static bool ValidateLocalCredentials(string username, string password, IConfiguration? config = null)
{
    var normalized = NormalizeUsername(username);
    if (string.IsNullOrWhiteSpace(normalized) || string.IsNullOrWhiteSpace(password)) return false;
    var domain = config?["Auth:Domain"]?.Trim();
    try
    {
        // Active Directory (optional): set "Auth:Domain" to the NetBIOS or DNS domain name, e.g. COMPANY
        if (!string.IsNullOrWhiteSpace(domain))
        {
            using var domainCtx = new PrincipalContext(ContextType.Domain, domain);
            if (domainCtx.ValidateCredentials(normalized, password, ContextOptions.Negotiate)) return true;
        }
    }
    catch
    {
        /* fall through to local SAM */
    }
    try
    {
        using var machine = new PrincipalContext(ContextType.Machine);
        return machine.ValidateCredentials(normalized, password, ContextOptions.Negotiate);
    }
    catch
    {
        return false;
    }
}

static string GetProjectName(string departmentPath, string filePath)
{
    var relative = Path.GetRelativePath(departmentPath, filePath);
    var normalized = relative.Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar);
    var segments = normalized.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
    return segments.Length > 1 ? segments[0] : "General";
}

static IEnumerable<string> EnumerateFilesSafe(string rootPath)
{
    var pending = new Stack<string>();
    pending.Push(rootPath);

    while (pending.Count > 0)
    {
        var current = pending.Pop();
        string[] subDirs;
        string[] files;

        try
        {
            subDirs = Directory.GetDirectories(current);
        }
        catch
        {
            subDirs = Array.Empty<string>();
        }

        try
        {
            files = Directory.GetFiles(current);
        }
        catch
        {
            files = Array.Empty<string>();
        }

        foreach (var file in files)
        {
            yield return file;
        }

        foreach (var subDir in subDirs)
        {
            pending.Push(subDir);
        }
    }
}

app.MapGet("/api/test-root", (IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    return Results.Ok(new
    {
        rootPath,
        exists = Directory.Exists(rootPath)
    });
});

app.MapPost("/api/auth/login", (WindowsLoginRequest request, IConfiguration config) =>
{
    var username = NormalizeUsername(request.Username ?? request.EmployeeId ?? "");
    var password = request.Password ?? "";
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
    {
        return Results.BadRequest(new { error = "username and password are required." });
    }

    if (!ValidateLocalCredentials(username, password, config))
    {
        return Results.Unauthorized();
    }

    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
    {
        return Results.Ok(new
        {
            ok = true,
            user = new
            {
                username,
                employeeId = username,
                name = username
            },
            departments = Array.Empty<object>()
        });
    }

    var accessibleDepartments = (TryGetDirectories(rootPath, out var loginDeptDirs) ? loginDeptDirs : Array.Empty<string>())
        .Select(dir =>
        {
            var name = Path.GetFileName(dir);
            var hasAccess = CanUserAccessDepartment(username, name, out var groups);
            return new
            {
                id = name.Trim().ToLower().Replace(" ", "_"),
                label = name,
                folderPath = dir,
                expectedGroup = GetDepartmentUsersGroupName(name),
                permission = GetBasicPermissions(dir, username, groups).canEdit
                    ? "edit"
                    : (GetBasicPermissions(dir, username, groups).canView ? "view" : "none"),
                hasAccess,
                groups
            };
        })
        .Where(x => x.hasAccess)
        .OrderBy(x => x.label)
        .ToArray();

    var selectedDepartmentId = (request.DepartmentId ?? "").Trim().ToLowerInvariant();
    if (!string.IsNullOrWhiteSpace(selectedDepartmentId) && !accessibleDepartments.Any(x => x.id == selectedDepartmentId))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var resolvedDepartment = accessibleDepartments.FirstOrDefault(x => x.id == selectedDepartmentId)
        ?? accessibleDepartments.FirstOrDefault();

    return Results.Ok(new
    {
        ok = true,
        user = new
        {
            username,
            employeeId = username,
            name = username,
            departmentId = resolvedDepartment?.id ?? "",
            department = resolvedDepartment?.label ?? "",
            groups = accessibleDepartments.SelectMany(x => x.groups).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x).ToArray()
        },
        departments = accessibleDepartments.Select(x => new
        {
            x.id,
            x.label,
            x.folderPath,
            x.permission
        }).ToArray()
    });
});

app.MapGet("/api/departments", (string? username, IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath))
    {
        return Results.BadRequest(new { error = "FileServer:RootPath is not configured." });
    }

    if (!Directory.Exists(rootPath))
    {
        return Results.NotFound(new { error = "Root folder does not exist.", rootPath });
    }

    var userGroups = string.IsNullOrWhiteSpace(username) ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) : GetUserLocalGroups(username);

    var departments = (TryGetDirectories(rootPath, out var apiDeptDirs) ? apiDeptDirs : Array.Empty<string>())
        .Select(dir =>
        {
            var name = Path.GetFileName(dir);
            var expectedGroup = GetDepartmentUsersGroupName(name);
            var hasAccessByGroup = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
            var hasAccessByAcl = GetBasicPermissions(dir, username, userGroups).canView;
            var hasAccess = hasAccessByGroup || hasAccessByAcl;
            return new
            {
                id = name.Trim().ToLower().Replace(" ", "_"),
                label = name,
                folderPath = dir,
                expectedGroup,
                permission = GetBasicPermissions(dir, username, userGroups).canEdit
                    ? "edit"
                    : (GetBasicPermissions(dir, username, userGroups).canView ? "view" : "none"),
                hasAccess
            };
        })
        .Where(x => x.hasAccess)
        .OrderBy(x => x.label)
        .ToArray();

    return Results.Ok(new
    {
        rootPath,
        username,
        userGroups = userGroups.OrderBy(x => x).ToArray(),
        count = departments.Length,
        departments
    });
});

app.MapGet("/api/department-content", (string? department, string? username, IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath))
    {
        return Results.BadRequest(new { error = "FileServer:RootPath is not configured." });
    }

    if (!Directory.Exists(rootPath))
    {
        return Results.NotFound(new { error = "Root folder does not exist.", rootPath });
    }

    var requested = (department ?? "").Trim();
    if (string.IsNullOrWhiteSpace(requested))
    {
        return Results.BadRequest(new { error = "department is required." });
    }

    var userGroups = string.IsNullOrWhiteSpace(username) ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) : GetUserLocalGroups(username);
    var expectedGroup = GetDepartmentUsersGroupName(requested);
    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }
    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;
    var hasAccessByGroup = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
    var hasAccessByAcl = GetBasicPermissions(departmentPath, username, userGroups).canView;
    var hasAccess = hasAccessByGroup || hasAccessByAcl;
    if (!hasAccess)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var dirsOk = TryGetDirectories(departmentPath, out var dirPaths);
    var filesOk = TryGetFiles(departmentPath, out var filePaths);
    var listingRestricted = !dirsOk || !filesOk;

    var folders = dirPaths
        .Select(dir => new
        {
            name = Path.GetFileName(dir),
            path = dir,
            access = GetBasicPermissions(dir, username, userGroups)
        })
        .OrderBy(x => x.name)
        .ToArray();

    var files = filePaths
        .Select(file =>
        {
            var info = new FileInfo(file);
            return new
            {
                name = info.Name,
                path = info.FullName,
                size = info.Length,
                lastModified = info.LastWriteTimeUtc,
                access = GetBasicPermissions(info.FullName, username, userGroups)
            };
        })
        .OrderBy(x => x.name)
        .ToArray();

    return Results.Ok(new
    {
        department = departmentName,
        departmentPath,
        username,
        expectedGroup = GetDepartmentUsersGroupName(departmentName),
        /** Effective NTFS rights on the department root (used when no project subfolder exists yet). */
        access = GetBasicPermissions(departmentPath, username, userGroups),
        folders,
        files,
        listingRestricted,
        listingHint = listingRestricted
            ? "The Windows account running windows-bridge-api cannot list this folder. Grant that account Read & execute + List folder contents on the department path (the API runs as that account, not as the signed-in user)."
            : null
    });
});

app.MapGet("/api/files", (string? department, string? username, IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath))
    {
        return Results.BadRequest(new { error = "FileServer:RootPath is not configured." });
    }

    if (!Directory.Exists(rootPath))
    {
        return Results.NotFound(new { error = "Root folder does not exist.", rootPath });
    }

    var requested = (department ?? "").Trim();
    if (string.IsNullOrWhiteSpace(requested))
    {
        return Results.BadRequest(new { error = "department is required." });
    }

    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }
    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;
    var userGroups = string.IsNullOrWhiteSpace(username) ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) : GetUserLocalGroups(username);
    var expectedGroup = GetDepartmentUsersGroupName(requested);
    var hasAccess = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
    if (!hasAccess)
    {
        var aclAllowed = GetBasicPermissions(departmentPath, username, userGroups).canView;
        if (!aclAllowed) return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var files = EnumerateFilesSafe(departmentPath)
        .Select(file =>
        {
            var info = new FileInfo(file);
            return new
            {
                id = Path.GetRelativePath(departmentPath, file).Replace('\\', '/'),
                name = info.Name,
                folder = GetProjectName(departmentPath, file),
                path = info.FullName,
                size = info.Length,
                lastModified = info.LastWriteTimeUtc,
                access = GetBasicPermissions(info.FullName, username, userGroups)
            };
        })
        .OrderBy(x => x.folder)
        .ThenBy(x => x.name)
        .ToArray();

    return Results.Ok(new
    {
        department = departmentName,
        username,
        count = files.Length,
        files
    });
});

// Lightweight health check for upload route — avoids multipart POST probes that time out over slow tunnels.
app.MapGet("/api/files/upload", () =>
    Results.Ok(new { ok = true, hint = "POST multipart/form-data with field file; query department & project." }));

app.MapPost("/api/files/upload", async (HttpRequest request, string? department, string? project, string? username, IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath))
    {
        return Results.BadRequest(new { error = "FileServer:RootPath is not configured." });
    }

    if (!Directory.Exists(rootPath))
    {
        return Results.NotFound(new { error = "Root folder does not exist.", rootPath });
    }

    var requested = ResolveRequestedDepartment(request, department);
    if (string.IsNullOrWhiteSpace(requested))
    {
        return Results.BadRequest(new { error = "department is required." });
    }

    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }

    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;
    var userGroups = string.IsNullOrWhiteSpace(username) ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) : GetUserLocalGroups(username);
    var expectedGroup = GetDepartmentUsersGroupName(departmentName);
    var hasAccess = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
    if (!hasAccess)
    {
        var aclAllowed = GetBasicPermissions(departmentPath, username, userGroups).canView;
        if (!aclAllowed)
        {
            return Results.Json(
                new
                {
                    error = "No access to this department folder.",
                    detail = "NTFS denies Read/List for this Windows account, or the signed-in username does not match the ACL (use the same account that appears on the folder Security tab).",
                },
                statusCode: StatusCodes.Status403Forbidden);
        }
    }

    var form = await request.ReadFormAsync();
    var file = form.Files["file"] ?? form.Files.FirstOrDefault();
    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "file is required." });
    }

    var requestedProject = (project ?? form["project"].FirstOrDefault() ?? "General").Trim();
    var isGeneral = string.Equals(requestedProject, "General", StringComparison.OrdinalIgnoreCase);
    var safeProject = string.Concat(requestedProject.Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch));
    var safeName = string.Concat((form["name"].FirstOrDefault() ?? file.FileName ?? "").Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch));
    if (string.IsNullOrWhiteSpace(safeName))
    {
        safeName = $"upload-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.bin";
    }

    var targetDir = isGeneral ? departmentPath : Path.Combine(departmentPath, safeProject);
    if (!IsPathUnderRoot(departmentPath, targetDir))
    {
        return Results.BadRequest(new { error = "Invalid upload path." });
    }

    try
    {
        if (!isGeneral)
        {
            Directory.CreateDirectory(targetDir);
        }

        var canEditTarget = GetBasicPermissions(targetDir, username, userGroups).canEdit;
        if (!canEditTarget)
        {
            return Results.Json(
                new
                {
                    error = "File server denied upload permission for this folder.",
                    detail =
                        "NTFS does not grant Modify / Create files for this account on the upload path. Grant Modify on the department folder (and project subfolder when not General). If the folder Properties → Read-only is ticked, clear it for folders — it is not the same as file read-only.",
                },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var targetPath = Path.GetFullPath(Path.Combine(targetDir, safeName));
        if (!IsPathUnderRoot(departmentPath, targetPath))
        {
            return Results.BadRequest(new { error = "Invalid upload file path." });
        }

        await using var stream = File.Create(targetPath);
        await file.CopyToAsync(stream);

        var relative = Path.GetRelativePath(departmentPath, targetPath).Replace('\\', '/');
        var finalProject = GetProjectName(departmentPath, targetPath);

        return Results.Ok(new
        {
            ok = true,
            file = new
            {
                id = relative,
                name = Path.GetFileName(targetPath),
                folder = finalProject,
                path = targetPath,
                size = new FileInfo(targetPath).Length,
                lastModified = File.GetLastWriteTimeUtc(targetPath),
                access = GetBasicPermissions(targetPath, username, userGroups)
            }
        });
    }
    catch (UnauthorizedAccessException ex)
    {
        return Results.Json(
            new
            {
                error = "Access denied writing the file.",
                detail = ex.Message,
                hint =
                    "Grant the Windows account that runs windows-bridge-api Modify on this department folder (File.Create runs as that account). NTFS rights for the signed-in user control what the UI shows, but IO uses the bridge process identity.",
            },
            statusCode: StatusCodes.Status403Forbidden);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapGet("/api/files/content/{*fileId}", (HttpRequest request, string fileId, string? department, string? username, IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath))
    {
        return Results.BadRequest(new { error = "FileServer:RootPath is not configured." });
    }

    if (!Directory.Exists(rootPath))
    {
        return Results.NotFound(new { error = "Root folder does not exist.", rootPath });
    }

    var requested = ResolveRequestedDepartment(request, department);
    if (string.IsNullOrWhiteSpace(requested))
    {
        return Results.BadRequest(new { error = "department is required." });
    }

    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }

    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;
    var userGroups = string.IsNullOrWhiteSpace(username) ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) : GetUserLocalGroups(username);
    var expectedGroup = GetDepartmentUsersGroupName(departmentName);
    var hasAccess = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
    if (!hasAccess)
    {
        var aclAllowed = GetBasicPermissions(departmentPath, username, userGroups).canView;
        if (!aclAllowed) return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var relativeFileId = (fileId ?? "").Trim().Replace('/', Path.DirectorySeparatorChar);
    if (string.IsNullOrWhiteSpace(relativeFileId))
    {
        return Results.BadRequest(new { error = "fileId is required." });
    }

    var fullPath = Path.GetFullPath(Path.Combine(departmentPath, relativeFileId));
    if (!IsPathUnderRoot(departmentPath, fullPath))
    {
        return Results.BadRequest(new { error = "Invalid file path." });
    }

    if (!File.Exists(fullPath))
    {
        return Results.NotFound(new { error = "File not found" });
    }

    var access = GetBasicPermissions(fullPath, username, userGroups);
    var canView = access.canView;
    if (!canView)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(fullPath, out var contentType))
    {
        contentType = "application/octet-stream";
    }

    return Results.File(fullPath, contentType, enableRangeProcessing: true);
});

app.MapGet("/api/files/download/{*fileId}", (HttpRequest request, string fileId, string? department, string? username, IConfiguration config) =>
{
    var rootPath = config["FileServer:RootPath"] ?? "";
    if (string.IsNullOrWhiteSpace(rootPath))
    {
        return Results.BadRequest(new { error = "FileServer:RootPath is not configured." });
    }

    if (!Directory.Exists(rootPath))
    {
        return Results.NotFound(new { error = "Root folder does not exist.", rootPath });
    }

    var requested = ResolveRequestedDepartment(request, department);
    if (string.IsNullOrWhiteSpace(requested))
    {
        return Results.BadRequest(new { error = "department is required." });
    }

    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }

    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;
    var userGroups = string.IsNullOrWhiteSpace(username) ? new HashSet<string>(StringComparer.OrdinalIgnoreCase) : GetUserLocalGroups(username);
    var expectedGroup = GetDepartmentUsersGroupName(departmentName);
    var hasAccess = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
    if (!hasAccess)
    {
        var aclAllowed = GetBasicPermissions(departmentPath, username, userGroups).canView;
        if (!aclAllowed) return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var relativeFileId = (fileId ?? "").Trim().Replace('/', Path.DirectorySeparatorChar);
    if (string.IsNullOrWhiteSpace(relativeFileId))
    {
        return Results.BadRequest(new { error = "fileId is required." });
    }

    var fullPath = Path.GetFullPath(Path.Combine(departmentPath, relativeFileId));
    if (!IsPathUnderRoot(departmentPath, fullPath))
    {
        return Results.BadRequest(new { error = "Invalid file path." });
    }

    if (!File.Exists(fullPath))
    {
        return Results.NotFound(new { error = "File not found" });
    }

    var access = GetBasicPermissions(fullPath, username, userGroups);
    var canDownload = access.canDownload;
    if (!canDownload)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var provider = new FileExtensionContentTypeProvider();
    if (!provider.TryGetContentType(fullPath, out var contentType))
    {
        contentType = "application/octet-stream";
    }

    return Results.File(fullPath, contentType, Path.GetFileName(fullPath), enableRangeProcessing: true);
});

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast =  Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast")
.WithOpenApi();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

record FileAccessPermissions(bool canView, bool canEdit, bool canDownload, bool canDelete);

record WindowsLoginRequest(string? Username, string? EmployeeId, string? Password, string? DepartmentId);

static class WindowsAclPermissions
{
    public static FileAccessPermissions GetBasicPermissions(string targetPath, string? username = null, HashSet<string>? userGroups = null)
    {
        var exists = Directory.Exists(targetPath) || File.Exists(targetPath);
        if (!exists)
        {
            return new FileAccessPermissions(false, false, false, false);
        }

        var attributes = File.GetAttributes(targetPath);
        var isDirectoryEntry = attributes.HasFlag(FileAttributes.Directory);
        // Folder "Read-only" attribute does not mean the same as file read-only; treating it as non-editable blocked uploads on valid NTFS Modify ACLs.
        var isReadOnly = !isDirectoryEntry && (attributes & FileAttributes.ReadOnly) != 0;

        if (string.IsNullOrWhiteSpace(username))
        {
            return new FileAccessPermissions(true, !isReadOnly, true, !isReadOnly);
        }

        try
        {
            var identities = BuildUserIdentitySet(username, userGroups);
            FileSystemSecurity acl;
            if (attributes.HasFlag(FileAttributes.Directory))
            {
                acl = new DirectoryInfo(targetPath).GetAccessControl();
            }
            else
            {
                acl = new FileInfo(targetPath).GetAccessControl();
            }

            var rules = acl.GetAccessRules(true, true, typeof(NTAccount)).OfType<FileSystemAccessRule>().ToArray();
            var denyRead = false;
            var denyWrite = false;
            var denyDelete = false;
            var allowRead = false;
            var allowWrite = false;
            var allowDelete = false;

            foreach (var rule in rules)
            {
                var identity = rule.IdentityReference?.Value ?? "";
                if (!IdentityMatches(identity, identities))
                {
                    continue;
                }

                var rights = rule.FileSystemRights;
                var isDeny = rule.AccessControlType == AccessControlType.Deny;
                var affectsRead =
                    HasRights(rights, FileSystemRights.ReadData) ||
                    HasRights(rights, FileSystemRights.Read) ||
                    HasRights(rights, FileSystemRights.ReadAndExecute) ||
                    HasRights(rights, FileSystemRights.ListDirectory) ||
                    HasRights(rights, FileSystemRights.FullControl) ||
                    HasRights(rights, FileSystemRights.Modify);
                var affectsWrite =
                    HasRights(rights, FileSystemRights.WriteData) ||
                    HasRights(rights, FileSystemRights.CreateFiles) ||
                    HasRights(rights, FileSystemRights.AppendData) ||
                    HasRights(rights, FileSystemRights.Write) ||
                    HasRights(rights, FileSystemRights.Modify) ||
                    HasRights(rights, FileSystemRights.FullControl);
                var affectsDelete =
                    HasRights(rights, FileSystemRights.Delete) ||
                    HasRights(rights, FileSystemRights.Modify) ||
                    HasRights(rights, FileSystemRights.FullControl);

                if (isDeny)
                {
                    if (affectsRead) denyRead = true;
                    if (affectsWrite) denyWrite = true;
                    if (affectsDelete) denyDelete = true;
                }
                else
                {
                    if (affectsRead) allowRead = true;
                    if (affectsWrite) allowWrite = true;
                    if (affectsDelete) allowDelete = true;
                }
            }

            var canView = allowRead && !denyRead;
            var canEdit = canView && allowWrite && !denyWrite && !isReadOnly;
            var canDelete = canEdit && allowDelete && !denyDelete && !isReadOnly;
            var canDownload = canView;
            return new FileAccessPermissions(canView, canEdit, canDownload, canDelete);
        }
        catch
        {
        return new FileAccessPermissions(true, false, true, false);
        }
    }

    static bool IdentityMatches(string identityValue, HashSet<string> identities)
    {
        if (string.IsNullOrWhiteSpace(identityValue) || identities.Count == 0)
        {
            return false;
        }

        var trimmed = identityValue.Trim();
        if (identities.Contains(trimmed))
        {
            return true;
        }

        var simple = trimmed.Contains('\\')
            ? trimmed.Split('\\', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? trimmed
            : trimmed;
        return identities.Contains(simple);
    }

    static HashSet<string> BuildUserIdentitySet(string? username, HashSet<string>? userGroups = null)
    {
        var identities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var normalized = NormalizeUsername(username ?? "");
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            identities.Add(normalized);
            identities.Add($@"{Environment.MachineName}\{normalized}");
            var domainOrWorkgroup = Environment.UserDomainName;
            if (!string.IsNullOrWhiteSpace(domainOrWorkgroup)
                && !domainOrWorkgroup.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase))
            {
                identities.Add($@"{domainOrWorkgroup}\{normalized}");
            }
        }

        foreach (var group in userGroups ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(group)) continue;
            identities.Add(group);
            identities.Add($@"{Environment.MachineName}\{group}");
            identities.Add($@"BUILTIN\{group}");
            identities.Add($@"NT AUTHORITY\{group}");
        }

        identities.Add(@"NT AUTHORITY\Authenticated Users");
        identities.Add(@"BUILTIN\Users");
        identities.Add("Users");
        return identities;
    }

    static string NormalizeUsername(string username)
    {
        var value = (username ?? "").Trim();
        if (string.IsNullOrWhiteSpace(value)) return "";
        if (value.Contains('\\')) value = value.Split('\\', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? value;
        if (value.Contains('@')) value = value.Split('@', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? value;
        return value.Trim();
    }

    static bool HasRights(FileSystemRights value, FileSystemRights expected)
    {
        return (value & expected) == expected;
    }

}
