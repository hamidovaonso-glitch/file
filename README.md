# 🔐 VaultDrop — Private File Sharing

A mini Dropbox for up to **7 users** with **500MB** shared storage.

## Features
- ✅ Register with username + password
- ✅ First user to register becomes **Admin** automatically
- ✅ Max 7 users — no more registrations after that
- ✅ Upload, download, delete files
- ✅ 500MB shared storage with live usage bar
- ✅ Admin panel: manage users, remove accounts
- ✅ Dark modern UI

---

## 🚀 Quick Start (Local)

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher recommended)

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment
```bash
cp .env.example .env
```
Edit `.env` and change `JWT_SECRET` to something random and long.

### 4. Run the server
```bash
npm start
```

Open http://localhost:3000 in your browser.

---

## ☁️ Deploy to Railway (Free)

1. Create account at https://railway.app
2. Push this folder to a GitHub repo
3. On Railway → "New Project" → "Deploy from GitHub repo"
4. Add environment variable: `JWT_SECRET=your-secret-here`
5. Railway gives you a live URL — share it with your 7 users!

## ☁️ Deploy to Render (Free)

1. Create account at https://render.com
2. Push this folder to a GitHub repo
3. New → Web Service → connect your repo
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add environment variable: `JWT_SECRET=your-secret-here`
7. Deploy!

---

## 📁 Project Structure

```
vaultdrop/
├── server.js          ← Backend (Node.js + Express)
├── package.json
├── .env.example       ← Copy to .env and edit
├── .gitignore
├── uploads/           ← Where files are stored (auto-created)
├── vaultdrop.db       ← SQLite database (auto-created)
└── public/
    └── index.html     ← Frontend (all-in-one HTML)
```

---

## 🔑 How Users Work

| Rule | Detail |
|------|--------|
| First to register | Becomes admin |
| Max users | 7 (enforced by server) |
| Admin can | Delete any file, remove users |
| Regular users | Upload, download, delete their own files |
| Passwords | Securely hashed with bcrypt |
| Sessions | JWT tokens, expire after 7 days |

---

## ⚠️ Notes

- **Storage is shared** across all users (500MB total)
- Files are stored on the server's disk — if you use Railway/Render free tier, files may be lost on redeploy. For permanent storage, consider upgrading or using Cloudflare R2 / AWS S3.
- Change `JWT_SECRET` in `.env` before deploying!
