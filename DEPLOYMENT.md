# Inyatsi File Share Portal – Production Deployment Guide

Deploy to your real system with domain **inyatsi.com** and your file server.

---

## 1. Recommended Domain Structure

| Service | URL | Purpose |
|---------|-----|---------|
| **API (Backend)** | `https://api.inyatsi.com` | REST API for admin dashboard |
| **Admin Dashboard** | `https://admin.inyatsi.com` | Web admin panel |

You need DNS records for:
- `api.inyatsi.com` → Your server IP
- `admin.inyatsi.com` → Your server IP

---

## 2. File Server Integration

Your backend supports direct file-server access:

### Network File Share (SMB/Windows)

If your file server is a Windows share (e.g. `\\fileserver\InyatsiFiles`):

1. **Mount the share** on the server running the backend:
   - **Linux**: `mount -t cifs //fileserver/InyatsiFiles /mnt/inyatsi-files -o username=...,password=...`
   - **Windows**: Map network drive (e.g. `Z:\`) to `\\fileserver\InyatsiFiles`

2. **Set in backend `.env`**:
   ```
   FILE_SERVER_ROOT=/mnt/inyatsi-files
   ```

3. **Folder structure** on the file server should match departments:
   ```
   /mnt/inyatsi-files/
   ├── Engineering Site Reports/
   ├── Finance Documents/
   └── (IT Admin uses root /)
   ```

## 3. Server Setup (One Linux Server Example)

### Install Node.js, nginx, PM2

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# PM2 for process management
sudo npm install -g pm2
```

### Deploy Backend

```bash
cd /opt/inyatsi
git clone <your-repo> .
cd backend
npm install --production
```

Create `/opt/inyatsi/backend/.env`:

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=your-strong-random-secret-min-32-chars

# File server root
FILE_SERVER_ROOT=/mnt/inyatsi-files

# Optional Windows bridge / auth service
# EXTERNAL_AUTH_URL=http://server-ip:5200
# EXTERNAL_AUTH_FALLBACK_TO_LOCAL=true

# Users (or sync from AD/LDAP later)
USERS_FILE=/opt/inyatsi/backend/config/users.json
```

Start backend:

```bash
pm2 start server.js --name inyatsi-api
pm2 save
pm2 startup
```

### Deploy Admin Dashboard

```bash
cd /opt/inyatsi/admin-dashboard
npm install
npm run build
```

The built files go to `dist/`. Serve them with nginx (see below).

---

## 4. Nginx Reverse Proxy (SSL + Routing)

Install certbot for HTTPS:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.inyatsi.com -d admin.inyatsi.com
```

Create `/etc/nginx/sites-available/inyatsi`:

```nginx
# API Backend
server {
    listen 80;
    server_name api.inyatsi.com;
    return 301 https://$server_name$request_uri;
}
server {
    listen 443 ssl http2;
    server_name api.inyatsi.com;
    ssl_certificate /etc/letsencrypt/live/api.inyatsi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.inyatsi.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100M;
    }
}

# Admin Dashboard
server {
    listen 80;
    server_name admin.inyatsi.com;
    return 301 https://$server_name$request_uri;
}
server {
    listen 443 ssl http2;
    server_name admin.inyatsi.com;
    ssl_certificate /etc/letsencrypt/live/admin.inyatsi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.inyatsi.com/privkey.pem;

    root /opt/inyatsi/admin-dashboard/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/inyatsi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. CORS (Backend)

The backend uses `cors()`. For production, restrict origins in `backend/server.js` if needed:

```javascript
app.use(cors({
  origin: [
    'https://admin.inyatsi.com',
  ],
  credentials: true,
}));
```

---

## 6. Checklist Before Go-Live

| Item | Action |
|------|--------|
| DNS | `api.inyatsi.com` and `admin.inyatsi.com` point to server IP |
| SSL | Certificates installed via certbot |
| File server | Mounted or reachable, folders exist |
| Users | `users.json` populated with real staff |
| JWT_SECRET | Strong random value, never default |
| Firewall | Ports 80, 443 open; 3000 only on localhost |

---

## 7. Quick Reference

```
Production URLs:
  API:    https://api.inyatsi.com
  Admin:  https://admin.inyatsi.com

Admin dashboard: Uses VITE_API_URL (defaults to same origin)
```
