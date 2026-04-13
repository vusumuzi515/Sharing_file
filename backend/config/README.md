# File Server Permissions (`users.json`)

`users.json` contains local portal sign-in accounts and should stay on the machine that runs the backend. Do not commit real usernames, passwords, or department assignments to GitHub.

## Safe setup

1. Copy `users.example.json` to `users.json`.
2. Replace the placeholder accounts with your real local or test users.
3. Keep `users.json` out of source control.

## Notes

- Users still select their department in the web portal.
- The backend reads `users.json` for local sign-in when external Windows authentication is not being used.
- File-server examples belong in `users.example.json`, not in `users.json` inside the repository.
