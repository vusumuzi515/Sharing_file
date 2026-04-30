# Windows Server Login Notes

## How sign-in works

1. Users enter their department, username, and password in the dashboard.
2. The backend validates those credentials against the connected Windows bridge or local portal users.
3. The dashboard then shows only the folders, files, and actions allowed by the current server configuration.

## Before testing

1. Start the Windows bridge on the server.
2. Confirm the backend `EXTERNAL_AUTH_URL` points to that bridge.
3. Confirm `FILE_SERVER_ROOT` points to the correct department root.
4. Confirm the user already has permission on the Windows server.

## If sign-in fails

- Check the bridge is running.
- Check the backend can reach the bridge.
- Check the user exists on the server.
- Check the user has access to the selected department.
