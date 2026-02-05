# Railway Quick Start Guide

## ✅ Completed
- Railway configuration files created and pushed to GitHub
- Backend: `railway.toml`, `nixpacks.toml`, `Procfile`
- Frontend: `nixpacks.toml`, updated `package.json` with start script
- Documentation: `RAILWAY_SETUP.md` with detailed instructions

## 🚀 Next Steps (Manual - Do in Railway Dashboard)

### Step 1: Create Backend Service
1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select `RepoIQ` repository
3. **IMPORTANT**: In service settings → Root Directory → Set to `Backend`
4. Railway will auto-detect Python and start building

### Step 2: Add Redis Database
1. In Backend service → Click "New" → "Database" → "Add Redis"
2. Railway auto-adds `REDIS_URL` environment variable

### Step 3: Configure Backend Environment Variables
Go to Backend service → Variables tab → Add these:

```
SECRET_KEY=<generate-32-char-secret>
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_KEY=<your-supabase-service-key>
GITHUB_CLIENT_ID=<your-github-oauth-client-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-secret>
OPENAI_API_KEY=<your-openai-api-key>
ALLOWED_ORIGINS=http://localhost:3000
```

**Note**: `REDIS_URL` is auto-added by Railway Redis plugin

### Step 4: Get Backend URL
1. Backend service → Settings → Networking → "Generate Domain"
2. Copy URL (e.g., `repoiq-backend.up.railway.app`)
3. Update `GITHUB_REDIRECT_URI` in Variables:
   ```
   GITHUB_REDIRECT_URI=https://<backend-url>/api/v1/auth/github/callback
   ```
4. Update your GitHub OAuth app callback URL to match

### Step 5: Create Frontend Service
1. In same Railway project → "New" → "GitHub Repo"
2. Select `RepoIQ` repository again
3. **IMPORTANT**: Set Root Directory to `Frontend`
4. Add environment variable:
   ```
   VITE_API_BASE_URL=https://<backend-url>/api/v1
   ```
5. Deploy Frontend

### Step 6: Update CORS
1. Get Frontend URL: Frontend service → Settings → Networking → Generate Domain
2. Go back to Backend service → Variables
3. Update `ALLOWED_ORIGINS`:
   ```
   ALLOWED_ORIGINS=https://<frontend-url>,http://localhost:3000
   ```
4. Redeploy Backend

### Step 7: Verify Deployment
- ✅ Backend: `https://<backend-url>/health` → Should return `{"status": "healthy"}`
- ✅ Frontend: `https://<frontend-url>` → Should load landing page
- ✅ Test: Login → Select repo → Run analysis

## 📋 Environment Variables Checklist

### Backend (Required)
- [ ] `SECRET_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_KEY`
- [ ] `SUPABASE_SERVICE_KEY`
- [ ] `GITHUB_CLIENT_ID`
- [ ] `GITHUB_CLIENT_SECRET`
- [ ] `GITHUB_REDIRECT_URI` (update after getting backend URL)
- [ ] `OPENAI_API_KEY`
- [ ] `ALLOWED_ORIGINS` (update after getting frontend URL)
- [ ] `REDIS_URL` (auto-added by Railway)

### Frontend (Required)
- [ ] `VITE_API_BASE_URL` (update after getting backend URL)

## 🔍 Troubleshooting

**Backend won't start:**
- Check all environment variables are set
- Verify Redis is connected
- Check logs in Railway dashboard

**Frontend can't connect to Backend:**
- Verify `VITE_API_BASE_URL` is correct
- Check Backend is running (test `/health` endpoint)
- Check CORS settings in Backend

**CORS errors:**
- Ensure `ALLOWED_ORIGINS` includes Frontend URL
- Redeploy Backend after updating

## 📚 Full Documentation
See `RAILWAY_SETUP.md` for detailed instructions and troubleshooting.
