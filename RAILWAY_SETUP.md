# Railway Deployment Guide for RepoIQ

## Architecture
This is a monorepo with two separate services that need to be deployed independently on Railway:
- **Backend**: FastAPI Python application
- **Frontend**: React + Vite application

## Setup Instructions

### 1. Create Backend Service

1. Go to Railway dashboard: https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `RepoIQ` repository
4. **Important**: Set the root directory to `Backend`
5. Railway will auto-detect Python and use the nixpacks.toml config

#### Backend Environment Variables (Required):
```
PORT=8000
REDIS_URL=<your_railway_redis_url>
SECRET_KEY=<generate_a_secure_key>
SUPABASE_URL=<your_supabase_url>
SUPABASE_KEY=<your_supabase_anon_key>
SUPABASE_SERVICE_KEY=<your_supabase_service_key>
GITHUB_CLIENT_ID=<your_github_oauth_client_id>
GITHUB_CLIENT_SECRET=<your_github_oauth_secret>
GITHUB_REDIRECT_URI=https://<your-backend-url>/auth/github/callback
OPENAI_API_KEY=<your_openai_api_key>
ALLOWED_ORIGINS=https://<your-frontend-url>,http://localhost:3000
```

### 2. Add Redis to Backend

1. In your Backend service, click "New" → "Database" → "Add Redis"
2. Railway will automatically add `REDIS_URL` to your environment variables
3. No additional configuration needed

### 3. Create Frontend Service

1. In the same project, click "New" → "GitHub Repo"
2. Select your `RepoIQ` repository again
3. **Important**: Set the root directory to `Frontend`
4. Railway will auto-detect Node.js and use the nixpacks.toml config

#### Frontend Environment Variables (Required):
```
PORT=3000
VITE_API_BASE_URL=https://<your-backend-url>/api/v1
```

### 4. Configure Custom Domains (Optional)

1. In each service, click "Settings" → "Networking" → "Generate Domain"
2. Railway will give you URLs like:
   - Backend: `repoiq-backend.up.railway.app`
   - Frontend: `repoiq-frontend.up.railway.app`
3. Update environment variables with these URLs

### 5. Deploy Order

1. **Deploy Backend first** (needs to be up for Frontend to work)
2. Wait for Backend to be healthy (check `/health` endpoint)
3. **Then deploy Frontend** with the correct `VITE_API_BASE_URL`

## Troubleshooting

### Backend won't start:
- Check Redis is connected
- Verify all environment variables are set
- Check logs for missing dependencies

### Frontend won't build:
- Ensure `VITE_API_BASE_URL` points to deployed Backend
- Check for missing npm dependencies
- Verify terser is installed

### CORS errors:
- Update `ALLOWED_ORIGINS` in Backend to include Frontend URL
- Redeploy Backend after changing

## Health Checks

- Backend: `https://<backend-url>/health`
- Frontend: `https://<frontend-url>/` should load the app

## Monitoring

- Railway provides automatic logs and metrics
- Check "Deployments" tab for build/deploy history
- Use "Metrics" tab for CPU/Memory usage

## Costs

Railway offers:
- $5/month free credit (Hobby plan)
- Backend + Redis + Frontend ≈ $15-20/month
- Monitor usage in "Usage" tab
