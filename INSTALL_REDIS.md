# Install Redis on Windows (5 Minutes)

## Step 1: Download Redis

Click here: https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.msi

## Step 2: Install

1. Run the downloaded `.msi` file
2. Accept the license agreement
3. Choose installation path (default: `C:\Program Files\Redis`)
4. **Important**: Check these options:
   - ✅ Add Redis to the PATH
   - ✅ Install Redis as a Windows Service
5. Click "Install"

## Step 3: Verify Installation

Open a **new** PowerShell/Terminal and run:

```powershell
redis-cli ping
```

**Expected output:**
```
PONG
```

If you see `PONG`, Redis is running! 🎉

## Step 4: Check Service Status

```powershell
Get-Service Redis
```

**Expected output:**
```
Status   Name               DisplayName
------   ----               -----------
Running  Redis              Redis
```

## Step 5: Configure (Optional)

Redis config file location:
```
C:\Program Files\Redis\redis.windows-service.conf
```

## Step 6: Restart Backend

After Redis is installed and running:

1. Stop your backend server (Ctrl+C in terminal)
2. Restart it:
   ```powershell
   cd "C:\Users\Syed Taha Hasan\Desktop\RepoIQ\Backend"
   python main.py
   ```

You should see in the logs:
```
✅ Rate limiting enabled with Redis
```

## Managing Redis Service

**Start Redis:**
```powershell
Start-Service Redis
```

**Stop Redis:**
```powershell
Stop-Service Redis
```

**Restart Redis:**
```powershell
Restart-Service Redis
```

**Check status:**
```powershell
Get-Service Redis
```

## Uninstall Redis (If Needed)

1. Open "Add or Remove Programs"
2. Search for "Redis"
3. Click "Uninstall"

## Troubleshooting

**Problem: "redis-cli not recognized"**
- Close and reopen your terminal (PATH needs to refresh)
- Or add manually: `C:\Program Files\Redis` to system PATH

**Problem: Service won't start**
```powershell
# Check if port 6379 is in use
netstat -ano | findstr :6379

# If in use, kill the process or change Redis port
```

**Problem: Connection refused from backend**
- Check Redis is running: `Get-Service Redis`
- Check firewall isn't blocking port 6379
- Verify .env has: `REDIS_URL=redis://localhost:6379/0`

## Test Redis Connection

```powershell
# Connect to Redis CLI
redis-cli

# Inside Redis CLI, test commands:
127.0.0.1:6379> SET test "Hello Redis"
OK
127.0.0.1:6379> GET test
"Hello Redis"
127.0.0.1:6379> EXIT
```

## Performance Test

```powershell
redis-benchmark -q -n 10000
```

This tests Redis performance with 10,000 operations.

---

That's it! Redis is now running as a background service and will auto-start on boot. 🚀
