# Nextcloud Login for Dashboard

## Users Must Use Their Nextcloud Account Password

Login validates credentials **directly against Nextcloud**. Each user must enter the password saved in their Nextcloud account.

### How it works

1. **Login** – User enters their Nextcloud username and password. The backend verifies against Nextcloud WebDAV.
2. **Department** – User must be able to access the selected department folder in Nextcloud (shared or owned).
3. **File access** – The backend uses the Inyatsi App Password (in `.env`) for file operations after login.

### If login fails with "Invalid credentials"

Nextcloud WebDAV often requires an **App Password** instead of the regular password:

1. Log in to Nextcloud in your browser
2. Settings → Security → Create new app password
3. Use that App Password when logging in to the dashboard
