# Inyatsi Departments API (FastAPI + Active Directory)

Permission-aware department list from Active Directory. The React frontend uses this to populate the Department Overview section.

## How it works

1. **Accepts** the logged-in user's JWT token (`Authorization: Bearer <token>`)
2. **Decodes** the token to get username/employeeId
3. **Queries Active Directory** (via ldap3) for the user's security groups
4. **Cross-references** with `config/ad_groups.json` mapping departments to security groups
5. **Returns** only departments the user is permitted to see

## Setup

```bash
cd backend-fastapi
pip install -r requirements.txt
```

## Environment (.env)

```env
# AD / LDAP (required for department lookup)
AD_SERVER=ldap://dc.inyatsi.com
AD_BASE_DN=DC=inyatsi,DC=com
AD_BIND_USER=cn=service,ou=users,dc=inyatsi,dc=com
AD_BIND_PASSWORD=your-service-password
AD_USER_FILTER=(&(objectClass=user)(sAMAccountName={username}))

# JWT (must match Node backend secret for token validation)
JWT_SECRET=change-me-in-production

# CORS (React app origin)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Department mapping (config/ad_groups.json)

```json
{
  "groups_to_departments": {
    "Engineering": "engineering",
    "Finance": "finance",
    "IT-Admin": "admin"
  },
  "departments": [
    { "id": "engineering", "label": "Engineering", "folder_path": "Engineering", "permission": "edit" },
    { "id": "finance", "label": "Finance Documents", "folder_path": "Finance Documents", "permission": "edit" },
    { "id": "admin", "label": "IT Administration", "folder_path": "/", "permission": "edit" }
  ],
  "admin_groups": ["IT-Admin"]
}
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

## API

- `GET /api/departments` – Returns permitted departments (requires Bearer token)
- `GET /api/stats/file-count?path=...` or `?department=...` – Cached file count (requires Bearer token, auth by department)
- `GET /api/permissions?path=...` – Effective NTFS ACL permissions (Read, Write, Delete) for the user (Windows + pywin32 only, requires Bearer token)
- `GET /health` – Health check

## File count (71 Files statistic)

A background task uses `os.walk` to scan mounted paths and cache file counts. Set:

```env
FILE_SCANNER_PATHS=Z:/Engineering/Site_Reports|site-reports,Z:/Finance|finance
# Or single path:
FILE_SERVER_ROOT=Z:/Engineering/Site_Reports
FILE_SCANNER_INTERVAL=300
```

The `/api/stats/file-count` endpoint returns the cached count only if the user is authorized (via AD groups) to view that network share.

## Frontend integration

Set `VITE_DEPARTMENTS_API_URL=http://localhost:8000` in the React app `.env` to use this API for the Department Overview. The frontend will call this endpoint with the user's token to get the permission-filtered department list.

### Inherited ACL (permissions endpoint)

The `/api/permissions?path=Z:/Engineering/Site_Reports` endpoint returns `{ "read": true, "write": false, "delete": false }` based on the NTFS ACL. The React frontend can use `fetchPathPermissions(path)` to conditionally show/hide buttons (e.g. hide Delete when `delete: false`). Requires Windows + pywin32.
