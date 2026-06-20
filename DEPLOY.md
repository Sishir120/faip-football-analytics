# 🚀 FAIP Deployment Guide
### Vercel (Frontend) + Railway (Backend + PostgreSQL)

> **Free tier summary:**
> - **Vercel Hobby** — completely free, no credit card, unlimited Next.js deployments
> - **Railway Starter** — $5/month free credit (your backend costs ~$0.50–$1.50/mo to run)

---

## Prerequisites

- GitHub account with this repo pushed to it
- [Vercel account](https://vercel.com/signup) (free)
- [Railway account](https://railway.com) (free, sign in with GitHub)

---

## Step 1 — Push to GitHub

```bash
# From the faip/ root directory
git init            # if not already a git repo
git add .
git commit -m "chore: add Railway + Vercel deployment configs"
git remote add origin https://github.com/YOUR_USERNAME/faip.git
git push -u origin main
```

---

## Step 2 — Deploy the Backend on Railway

### 2a — Create a new Railway project

1. Go to [railway.com](https://railway.com) → **New Project**
2. Choose **Deploy from GitHub repo** → select your `faip` repo
3. Railway auto-detects `railway.json` and `backend/Dockerfile` ✅

### 2b — Add a PostgreSQL database

1. In your project dashboard click **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically creates a `DATABASE_URL` variable and injects it into your backend service — **no manual copy-paste needed**

### 2c — Set environment variables

In your backend **service settings → Variables**, add:

| Variable | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://YOUR-APP.vercel.app` *(set after Vercel deploy)* |
| `PORT` | `8080` *(Railway sets this automatically — no action needed)* |

> ⚠️ **First deploy takes ~5–10 min** because it seeds La Liga 2018/19 data into Postgres. Watch the build logs — you'll see "Seeding completed successfully!" when done.

### 2d — Copy your Railway backend URL

Go to your service → **Settings → Networking → Public Domain**. It will look like:
```
https://faip-backend.up.railway.app
```
Save this — you'll need it for Vercel.

---

## Step 3 — Deploy the Frontend on Vercel

### 3a — Import your repo

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. When asked for the **Root Directory**, set it to: `frontend`
4. Framework: **Next.js** (auto-detected)

### 3b — Set environment variables

In the Vercel import wizard → **Environment Variables**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://faip-backend.up.railway.app` |

### 3c — Deploy

Click **Deploy**. Vercel will build in ~1-2 min and give you a URL like:
```
https://faip.vercel.app
```

---

## Step 4 — Wire the CORS setting back on Railway

Now that you have your Vercel URL, go back to Railway:

1. Backend service → **Variables**
2. Set `ALLOWED_ORIGINS` = `https://faip.vercel.app`
3. Railway redeploys automatically

---

## Step 5 — Verify Everything Works

| Check | Expected result |
|---|---|
| `https://faip-backend.up.railway.app/api/health` | `{"status": "healthy"}` |
| `https://faip-backend.up.railway.app/docs` | Swagger UI loads |
| `https://faip.vercel.app` | Dashboard with competitions |
| Click a match | Shot map renders |

---

## Local Development (unchanged)

```powershell
# From the faip/ directory
.\run.ps1
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000

---

## Environment Variable Reference

### Backend (`backend/.env.example`)

| Variable | Local | Railway |
|---|---|---|
| `DATABASE_URL` | *(unset → uses SQLite)* | Auto-injected by Postgres addon |
| `ALLOWED_ORIGINS` | *(unset → allows all)* | `https://faip.vercel.app` |

### Frontend (`frontend/.env.example`)

| Variable | Local | Vercel |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | `https://faip-backend.up.railway.app` |

---

## Troubleshooting

**Build fails on Railway?**
- Check Railway build logs for missing system packages
- The `Dockerfile` already installs `gcc`, `libpq-dev` for ML/Postgres deps

**Frontend shows "Failed to fetch"?**
- Confirm `NEXT_PUBLIC_API_URL` is set correctly in Vercel dashboard
- Confirm `ALLOWED_ORIGINS` on Railway includes your Vercel domain

**Database is empty after deploy?**
- Check Railway logs for "StatsBomb background database seeding" messages
- Seeding runs automatically if `matches` table is empty; it takes ~5 min

**CORS errors in browser?**
- Ensure `ALLOWED_ORIGINS` on Railway exactly matches your Vercel URL (no trailing slash)
