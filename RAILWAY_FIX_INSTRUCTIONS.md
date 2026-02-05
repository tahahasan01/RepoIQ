# Railway Deployment Fix - Root Directory Issue

## Problem
Railway is failing with: "Nixpacks was unable to generate a build plan" because it's looking at the root directory instead of the `Backend` directory.

## Solution: Set Root Directory in Railway

### Step 1: Fix Backend Service
1. Go to your Railway project: https://railway.app
2. Click on the **"RepoIQ"** service (the one that failed)
3. Click on **"Settings"** tab (top right)
4. **Set Root Directory:**
   - Scroll down to **"Source"** section (in the right sidebar)
   - Find **"Root Directory"** field
   - Change from empty/default to: **`Backend`**
   - Click **"Save"**
5. **Optional - Config-as-code (if Root Directory doesn't work):**
   - In Settings, click **"Config-as-code"** (right sidebar)
   - Click **"+ Add File Path"**
   - Enter: **`Backend/railway.toml`**
   - Click **"Save"**
6. Railway will automatically trigger a new deployment

### Step 2: Verify Build
- Watch the deployment logs
- You should see Railway detecting Python and running `pip install -r requirements.txt`
- Build should complete successfully

### Step 3: Add Environment Variables (if not done)
Go to **Variables** tab and add:
```
SECRET_KEY=<your-secret-key>
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-supabase-key>
SUPABASE_SERVICE_KEY=<your-supabase-service-key>
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>
OPENAI_API_KEY=<your-openai-api-key>
ALLOWED_ORIGINS=http://localhost:3000
REDIS_URL=<auto-added-by-railway-redis>
```

### Step 4: Add Redis (if not done)
1. In Backend service → Click **"New"** → **"Database"** → **"Add Redis"**
2. Railway automatically adds `REDIS_URL` environment variable

## Why This Happens
Railway defaults to the repository root. For monorepos, you must explicitly set the Root Directory to tell Railway which subdirectory contains the service code.

## Files Created for Railway
- ✅ `Backend/railway.toml` - Railway service config
- ✅ `Backend/nixpacks.toml` - Build configuration
- ✅ `Backend/Procfile` - Process definition
- ✅ `Backend/runtime.txt` - Python version
- ✅ `Backend/.python-version` - Python version (alternative)

All these files are in the `Backend/` directory, so Railway needs Root Directory = `Backend` to find them.

## After Backend Works
1. Create a second service for Frontend
2. Set Root Directory = `Frontend` for that service
3. Add `VITE_API_BASE_URL` environment variable pointing to Backend URL
