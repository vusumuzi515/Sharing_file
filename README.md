# Inyatsi file portal

## Backends

| Service | Role |
|--------|------|
| **Node** (`backend/server.js`, default `http://localhost:3000`) | Login (JWT), file server access, uploads, departments from the connected server, admin settings. |
| **Python FastAPI** (`backend-fastapi`, `npm run backend:fastapi`) | Optional: AD group → department mapping, NTFS `/api/permissions`, cached file counts. **Use the same `JWT_SECRET` as Node** so Bearer tokens from `/api/login` validate. |

The **web dashboard** talks to Node by default. Set `VITE_DEPARTMENTS_API_URL` in `admin-dashboard/.env` to route department list and path permissions to Python while keeping file operations on Node.

## Web dashboard

```bash
npm install
npm run dev
```

See `admin-dashboard/.env.example` for `VITE_BACKEND_API_URL`, optional `VITE_DEPARTMENTS_API_URL`, and `VITE_ACL_PATH_PREFIX` (UNC root for Windows ACL checks).

## Permissions

- **Portal:** `users.json` `permission` + JWT → read/upload/delete caps (`/api/me/session`).
- **Python (optional):** `VITE_ACL_PATH_PREFIX` + department `folderPath` → merge with NTFS `write` for upload UI.

## How file server inheritance works

1. **File server connection** — in **Settings → File server** enter the bridge **URL**, **server username**, and **password** if you are using a remote WebDAV-compatible source. For Windows bridge deployments, set the backend server values in `backend/.env`. After saving, departments follow top-level folders on the server. Password can be left blank on later saves to keep the stored one.

2. **After connect** — the API **inherits from the file server automatically**: if `inyatsi-config.json` exists at the server root, its **departments** and **user→department** rules apply; otherwise **top-level folders** on the server become departments (live scan). Files and subfolders follow that tree (`backend/config/dynamicConfig.js`).

3. **Portal passwords** — never read from the file server. Sign-in still uses **`users.json`** on the API host; `inyatsi-config.json` can list users to **merge** department/permission for accounts that already exist in `users.json`. Users only in the file config are shown in **Settings** until you add them to `users.json`.

4. **Portal upload behaviour (not chosen in the web UI)** — set on the file server in `inyatsi-config.json` under `"portal": { "uploadFileNaming": "unique-suffix" | "preserve-name" }`. **`preserve-name`** keeps the uploaded filename and overwrites the same path (server rules apply). **`unique-suffix`** adds a timestamp prefix. Optional env override on the API host: `PORTAL_UPLOAD_FILE_NAMING`.

4. **Changing to another server** — update the bridge or file-server settings, save, then refresh departments.
