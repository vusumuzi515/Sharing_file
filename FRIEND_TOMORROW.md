# Your friend’s PC (file server) — do tomorrow

You do these **on the Windows machine** that holds the files and runs the .NET bridge.

1. **Pull latest** `windows-bridge-api` and run from the project folder:
   ```text
   dotnet run --launch-profile http
   ```
   The app is pinned to **`http://0.0.0.0:5200`** (see `Program.cs`). The console must say **`Now listening on: http://0.0.0.0:5200`**. If Visual Studio used a **random port** (e.g. 5041) before, updating the repo fixes that. You can also force: `set ASPNETCORE_URLS=http://0.0.0.0:5200` then `dotnet run`.

2. **Install [ngrok](https://ngrok.com/download)** and sign in. One-time setup:
   ```text
   ngrok config add-authtoken <token from ngrok dashboard>
   ```

3. **Tunnel the same port as the bridge** (this project uses **5200**):
   ```text
   ngrok http 5200
   ```

4. **Send to you** the **https** line from ngrok, e.g. `https://abc-xyz.ngrok-free.app`  
   (Not `http://127.0.0.1` — the **forwarding** URL ngrok shows.)

5. **Keep running** while you test: bridge + `ngrok http` (both processes).

6. **Optional — Python agent** (only if you use the public VPS relay, not for ngrok→bridge on Node): on that same PC, `RELAY_URL` = your VPS, `ROOT_STORAGE` = same folder as `FileServer:RootPath` in the bridge `appsettings.json`.

---

## You (a few minutes after you receive the link)

1. In **`backend/.env`**: set `EXTERNAL_AUTH_URL` to the **https** URL they sent (and comment out or remove the old LAN `http://...` line so only one `EXTERNAL_AUTH_URL` is active).
2. **Restart the Node** backend.
3. **Admin dashboard**: if you use one, `VITE_BACKEND_API_URL` should still be **your** API, not the friend’s machine. Rebuild if you change any `VITE_*` (`npm run build` in `admin-dashboard`).
4. **Smoke test**: sign in, open departments / files, confirm lists load. If the ngrok free host changes later, you must update `EXTERNAL_AUTH_URL` again (or the friend can use a **reserved domain** in ngrok).
