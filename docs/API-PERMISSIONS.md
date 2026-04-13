# Portal APIs & file-server alignment

## Session & capabilities

- **`GET /api/me/session`** (Bearer required) — Returns `permission` from `users.json` (set by your admin) and `capabilities`: `read`, `download`, `upload`, `delete`, `edit`.  
  - `view` in `users.json` → read/download only (no upload/delete).  
  - `edit` → full file actions allowed by the backend routes.

## Path checks

- **`GET /api/permissions?path=...`** — Same rules as session, for UI that needs read/write/delete flags per path.  
  - If you use **FastAPI** (`VITE_DEPARTMENTS_API_URL`), NTFS checks can apply there instead.

## Department scope

- **`GET /api/users`** — Admins: all users (no passwords ever returned). Non-admins: same `departmentId` only.  
- **`GET /api/activity`** — Filtered to departments the user may access (admin: all).  
- **`GET /api/stats`** / **`GET /api/files/all`** — Already scoped by department for non-admins.

## When the file server changes

Restart the **Node** backend after editing `users.json` or department config. The web app **polls** departments/files/activity on an interval and on window focus so lists stay fresh after server updates.
