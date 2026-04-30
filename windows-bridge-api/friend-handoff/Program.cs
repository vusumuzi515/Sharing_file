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

static (string Name, string Path)? ResolveDepartmentDirectory(string rootPath, string requestedDepartment)
{
    if (string.IsNullOrWhiteSpace(rootPath) || string.IsNullOrWhiteSpace(requestedDepartment) || !Directory.Exists(rootPath))
    {
        return null;
    }

    var requested = requestedDepartment.Trim();
    var requestedId = ToDepartmentId(requested);

    foreach (var dir in Directory.GetDirectories(rootPath))
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

static bool ValidateLocalCredentials(string username, string password)
{
    var normalized = NormalizeUsername(username);
    if (string.IsNullOrWhiteSpace(normalized) || string.IsNullOrWhiteSpace(password)) return false;
    try
    {
        using var context = new PrincipalContext(ContextType.Machine);
        return context.ValidateCredentials(normalized, password, ContextOptions.Negotiate);
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

    if (!ValidateLocalCredentials(username, password))
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

    var accessibleDepartments = Directory.GetDirectories(rootPath)
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

    var departments = Directory.GetDirectories(rootPath)
        .Select(dir =>
        {
            var name = Path.GetFileName(dir);
            var expectedGroup = GetDepartmentUsersGroupName(name);
            var hasAccess = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
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

app.MapGet("/api/department-content", (string department, string? username, IConfiguration config) =>
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
    var hasAccess = userGroups.Count == 0 || userGroups.Contains(expectedGroup);
    if (!hasAccess)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }
    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;

    var folders = Directory.GetDirectories(departmentPath)
        .Select(dir => new
        {
            name = Path.GetFileName(dir),
            path = dir,
            access = GetBasicPermissions(dir, username, userGroups)
        })
        .OrderBy(x => x.name)
        .ToArray();

    var files = Directory.GetFiles(departmentPath)
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
        folders,
        files
    });
});

app.MapGet("/api/files", (string department, string? username, IConfiguration config) =>
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
    var hasAccess = userGroups.Count == 0 || UserHasAdministrativeAccess(userGroups) || userGroups.Contains(expectedGroup);
    if (!hasAccess)
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var resolvedDepartment = ResolveDepartmentDirectory(rootPath, requested);
    if (resolvedDepartment is null)
    {
        return Results.NotFound(new { error = "Department folder not found.", department = requested });
    }
    var departmentName = resolvedDepartment.Value.Name;
    var departmentPath = resolvedDepartment.Value.Path;

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
        return Results.StatusCode(StatusCodes.Status403Forbidden);
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
        return Results.StatusCode(StatusCodes.Status403Forbidden);
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
        var isReadOnly = (attributes & FileAttributes.ReadOnly) != 0;

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
