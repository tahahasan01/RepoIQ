# Deployment Guide

This guide covers deploying CodeRabbit AI backend to various platforms.

## Prerequisites

- GitHub account with OAuth App configured
- Supabase account with project created
- OpenAI API key
- Domain name (for production)
- SSL certificate (for production)

## Quick Setup Checklist

- [ ] Set up Supabase project
- [ ] Create GitHub OAuth App
- [ ] Get OpenAI API key
- [ ] Configure environment variables
- [ ] Set up database
- [ ] Deploy application
- [ ] Configure domain and SSL

## Platform-Specific Guides

### 1. Railway

**Steps:**

1. Fork/clone the repository
2. Create new project on Railway
3. Connect GitHub repository
4. Add environment variables:
   ```
   SUPABASE_URL=...
   SUPABASE_KEY=...
   SUPABASE_SERVICE_KEY=...
   DATABASE_URL=...
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   OPENAI_API_KEY=...
   SECRET_KEY=...
   ```
5. Deploy automatically on push

**Cost:** ~$5-20/month depending on usage

### 2. Render

**Steps:**

1. Create new Web Service
2. Connect repository
3. Configure build command: `pip install -r requirements.txt`
4. Configure start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables in dashboard
6. Deploy

**Free tier available with limitations**

### 3. Digital Ocean App Platform

**Steps:**

1. Create new app
2. Connect GitHub repository
3. Configure:
   - Build: `pip install -r requirements.txt`
   - Run: `uvicorn main:app --host 0.0.0.0 --port 8080`
4. Add environment variables
5. Deploy

**Cost:** ~$5-12/month

### 4. AWS Elastic Beanstalk

**Requirements:**
- AWS account
- EB CLI installed

**Steps:**

1. Initialize EB application:
   ```bash
   eb init -p python-3.11 coderabbit-backend
   ```

2. Create `Procfile`:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. Configure environment:
   ```bash
   eb create production-env
   eb setenv SUPABASE_URL=... GITHUB_CLIENT_ID=... ...
   ```

4. Deploy:
   ```bash
   eb deploy
   ```

**Cost:** ~$15-50/month depending on instance

### 5. Google Cloud Run

**Steps:**

1. Build Docker image:
   ```bash
   docker build -t gcr.io/YOUR-PROJECT/coderabbit-backend .
   ```

2. Push to GCR:
   ```bash
   docker push gcr.io/YOUR-PROJECT/coderabbit-backend
   ```

3. Deploy:
   ```bash
   gcloud run deploy coderabbit-backend \
     --image gcr.io/YOUR-PROJECT/coderabbit-backend \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

4. Set environment variables in console

**Pay per use, very cost-effective for variable loads**

### 6. Heroku

**Steps:**

1. Create `Procfile`:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

2. Create Heroku app:
   ```bash
   heroku create coderabbit-backend
   ```

3. Add PostgreSQL:
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```

4. Set environment variables:
   ```bash
   heroku config:set SUPABASE_URL=...
   heroku config:set GITHUB_CLIENT_ID=...
   # ... etc
   ```

5. Deploy:
   ```bash
   git push heroku main
   ```

**Cost:** ~$7-25/month

### 7. Azure Container Apps

**Steps:**

1. Create container registry
2. Build and push image:
   ```bash
   az acr build --registry myregistry --image coderabbit-backend .
   ```

3. Create container app:
   ```bash
   az containerapp create \
     --name coderabbit-backend \
     --resource-group mygroup \
     --image myregistry.azurecr.io/coderabbit-backend \
     --environment myenv \
     --ingress external \
     --target-port 8000
   ```

4. Configure environment variables in portal

**Cost:** ~$10-30/month

## Docker Deployment

### Using Docker Compose

1. Clone repository
2. Configure `.env` file
3. Run:
   ```bash
   docker-compose up -d
   ```

### Using Docker Swarm

1. Build image:
   ```bash
   docker build -t coderabbit-backend .
   ```

2. Initialize swarm:
   ```bash
   docker swarm init
   ```

3. Deploy stack:
   ```bash
   docker stack deploy -c docker-compose.yml coderabbit
   ```

### Using Kubernetes

Create deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coderabbit-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: coderabbit-backend
  template:
    metadata:
      labels:
        app: coderabbit-backend
    spec:
      containers:
      - name: api
        image: your-registry/coderabbit-backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
---
apiVersion: v1
kind: Service
metadata:
  name: coderabbit-backend
spec:
  selector:
    app: coderabbit-backend
  ports:
  - port: 80
    targetPort: 8000
  type: LoadBalancer
```

## Environment Variables

### Required

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db

# GitHub OAuth
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_REDIRECT_URI=https://your-domain.com/api/v1/auth/github/callback

# OpenAI
OPENAI_API_KEY=sk-...

# Security
SECRET_KEY=generate-with-openssl-rand-hex-32

# Redis
REDIS_URL=redis://localhost:6379/0
```

### Optional

```bash
# Application
APP_ENV=production
DEBUG=False
API_VERSION=v1

# CORS
BACKEND_CORS_ORIGINS=["https://your-frontend.com"]

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=INFO
```

## Database Setup

### Supabase

1. Create project on supabase.com
2. Copy project URL and keys
3. Database tables are created automatically
4. Create storage bucket:
   - Name: `profile-images`
   - Public: Yes

### Manual PostgreSQL

```bash
# Create database
createdb coderabbit

# Run migrations
alembic upgrade head
```

## SSL/HTTPS Setup

### Using Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Performance Tuning

### Gunicorn with Uvicorn Workers

```bash
gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

### Worker Calculation

```
workers = (2 × CPU cores) + 1
```

For 2 CPUs: `workers = 5`

## Monitoring

### Health Check Endpoints

- `GET /health` - Basic health
- `GET /` - API information

### Logging

Logs are output to stdout/stderr. Configure your platform to capture:

```bash
# Docker
docker logs -f container-name

# Systemd
journalctl -u coderabbit-backend -f

# PM2
pm2 logs coderabbit-backend
```

### Sentry Integration

Add to `.env`:
```
SENTRY_DSN=https://...@sentry.io/...
```

Errors are automatically reported.

## Scaling

### Horizontal Scaling

Deploy multiple instances behind a load balancer:

```
Load Balancer
    ├─→ Instance 1
    ├─→ Instance 2
    ├─→ Instance 3
    └─→ Instance N
```

### Database Connection Pooling

Configured in `DATABASE_URL`:
```
postgresql+asyncpg://user:pass@host/db?pool_size=20&max_overflow=0
```

### Redis Caching

Enable caching for:
- Repository metadata
- Analysis results
- GitHub API responses

## Backup & Recovery

### Database Backups

**Supabase:**
- Automatic daily backups
- Point-in-time recovery

**Manual PostgreSQL:**
```bash
# Backup
pg_dump -Fc dbname > backup.dump

# Restore
pg_restore -d dbname backup.dump
```

### Environment Backups

Store `.env` securely:
- Use secrets manager (AWS Secrets Manager, etc.)
- Encrypted storage
- Version control (encrypted)

## Troubleshooting

### Common Issues

**Database connection failed:**
- Check `DATABASE_URL` format
- Verify network connectivity
- Check firewall rules

**GitHub OAuth not working:**
- Verify callback URL matches
- Check client ID and secret
- Ensure scopes are correct

**OpenAI API errors:**
- Verify API key is valid
- Check rate limits
- Monitor token usage

**Import errors:**
- Ensure all dependencies installed
- Check Python version (3.11+)
- Verify virtual environment activated

## Cost Optimization

### OpenAI API

- Use `gpt-3.5-turbo` for non-critical tasks
- Implement caching
- Limit context window size
- Use streaming for large responses

### Database

- Use connection pooling
- Index frequently queried fields
- Archive old analyses
- Implement pagination

### Hosting

- Use auto-scaling
- Implement CDN for static assets
- Use spot instances (AWS)
- Monitor resource usage

## Security Checklist

- [ ] HTTPS enabled
- [ ] Environment variables secured
- [ ] Database credentials rotated
- [ ] API keys in secrets manager
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Input validation enabled
- [ ] SQL injection prevention (ORM)
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Security headers configured
- [ ] Regular dependency updates
- [ ] Monitoring and alerting set up

## Post-Deployment

1. **Test all endpoints**
   ```bash
   curl https://api.yourdomain.com/health
   ```

2. **Monitor logs**
   - Check for errors
   - Verify requests are being processed

3. **Test authentication**
   - Sign up new user
   - Login
   - Test protected routes

4. **Test GitHub integration**
   - Connect GitHub account
   - Sync repositories

5. **Run sample analysis**
   - Analyze a repository
   - Verify results

6. **Set up monitoring**
   - Configure alerts
   - Track metrics
   - Monitor costs

## Support

For deployment issues:
1. Check logs for error messages
2. Review environment variables
3. Verify external service connectivity
4. Check platform-specific documentation

## Updates & Maintenance

```bash
# Pull latest code
git pull origin main

# Install new dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Restart service
sudo systemctl restart coderabbit-backend
```

## Rollback Procedure

```bash
# Revert to previous version
git checkout previous-commit

# Rebuild and restart
docker-compose down
docker-compose up -d --build
