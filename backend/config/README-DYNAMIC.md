# Dynamic Departments & Permissions

The system automatically discovers departments from the file server and supports a config file for overrides.

## How it works

1. **Scan** – Backend scans the file server root for folders. Each folder = department.
2. **Config (optional)** – Place `inyatsi-config.json` at the file server root to override labels, set permissions, and map users.
3. **Refresh** – Config is cached for 1 minute. Changes on the file server are picked up automatically.

## Config file: inyatsi-config.json

Place at file server root (same level as department folders).

```json
{
  "departments": [
    {
      "id": "engineering",
      "folderPath": "/Engineering",
      "label": "Engineering",
      "permission": "edit"
    },
    {
      "id": "engineering_site_reports",
      "folderPath": "/Engineering Site Reports",
      "label": "Engineering Site Reports",
      "permission": "edit"
    },
    {
      "id": "finance",
      "folderPath": "/Finance Documents",
      "label": "Finance & Accounts",
      "permission": "view"
    }
  ],
  "users": [
    {
      "employeeId": "melusi",
      "departmentId": "engineering",
      "permission": "edit"
    },
    {
      "employeeId": "finance_user",
      "departmentId": "finance",
      "permission": "view"
    }
  ]
}
```

### Permissions

- **edit** – Can view and upload files
- **view** – Can only view/download files (no upload)

### Adding a new department (e.g. Lidwala)

1. Create the folder on the file server – e.g. `Lidwala`
2. **If it doesn’t appear**, add it to `inyatsi-config.json` at the file server root:

```json
{
  "departments": [
    { "id": "lidwala", "folderPath": "/Lidwala", "label": "Lidwala Department", "permission": "edit" }
  ]
}
```

3. Put `inyatsi-config.json` at the root of the connected file server (same level as other department folders)
4. Copy `users.example.json` to `users.json`, then add your real users with `departmentId: "lidwala"`
5. Click "Refresh from file server" in the admin Departments page
