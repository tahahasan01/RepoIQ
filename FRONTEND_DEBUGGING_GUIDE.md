# Frontend Issues Page Debugging Guide

## Problem
Issues page shows "0 found" even though backend has 24 issues saved.

## Backend Status ✅
```
[get_issues] Found 24 issues for analysis 0c19fd8f-9a34-4f6a-ae68-5e7f7290f32f
✓ Pre-cached 24 issues
✓ Analysis complete: 15 files, 24 issues found
```

**Issues ARE in the database!** The problem is the frontend not fetching them.

---

## Debug Steps

### Step 1: Check Current URL

Open browser and look at the URL bar. Should be:
```
http://localhost:8081/dashboard/e17246a6-d061-4001-95dd-ed175d5e30b3/issues
```

**If it's different (e.g., `/issues` without the dashboard/:id), that's the problem!**

### Step 2: Open Browser DevTools

1. Press `F12` to open DevTools
2. Go to **Console** tab
3. Look for these log messages:

**Good signs:**
```
[Issues] Fetching analysis results for repo: e17246a6-d061-4001-95dd-ed175d5e30b3
[Issues] Found 24 issues in results
```

**Bad signs:**
```
[Issues] No repoId in URL params
[Issues] Analysis results (raw): null
[Issues] Results exist but no issues array
```

### Step 3: Check Network Tab

1. In DevTools, go to **Network** tab
2. Refresh the page (F5)
3. Look for request to:
   ```
   /api/v1/analysis/repositories/e17246a6-d061-4001-95dd-ed175d5e30b3/results
   ```

4. Click on that request
5. Check the **Response** tab

**Should see:**
```json
{
  "id": "0c19fd8f-9a34-4f6a-ae68-5e7f7290f32f",
  "overall_score": 61,
  "security_score": 70,
  "quality_score": 46,
  "issues": [
    {
      "id": "...",
      "file_path": "frontend/src/services/api.ts",
      "severity": "high",
      "category": "hardcoded_configuration",
      "description": "...",
      "suggestion": "..."
    },
    ... 23 more issues
  ]
}
```

---

## Quick Fixes

### Fix 1: Navigate to Correct URL

**From Dashboard:**
1. Go to `http://localhost:8081/repos`
2. Find "CineMatch_Chatbot"  
3. Click "View Dashboard"
4. Then click "Issues" in the sidebar

**Direct Link:**
```
http://localhost:8081/dashboard/e17246a6-d061-4001-95dd-ed175d5e30b3/issues
```

### Fix 2: Clear Cache and Reload

1. Press `Ctrl+Shift+R` (hard reload)
2. Or clear browser cache:
   - `Ctrl+Shift+Delete`
   - Select "Cached images and files"
   - Click "Clear data"

### Fix 3: Check Session Storage

1. In DevTools Console, run:
   ```javascript
   sessionStorage.getItem('repoiq_analysis_e17246a6-d061-4001-95dd-ed175d5e30b3')
   ```

2. Should return JSON with issues array
3. If null, run:
   ```javascript
   sessionStorage.clear()
   location.reload()
   ```

---

## Expected Behavior

When you navigate to `/dashboard/:id/issues`:

1. ✅ Page loads with repo name "CineMatch_Chatbot"  
2. ✅ Shows "Last scan: 1/23/2026, 4:39:16 PM"
3. ✅ Console logs: `[Issues] Found 24 issues in results`
4. ✅ Shows "24 found" at top
5. ✅ Table displays all 24 issues
6. ✅ Filters show counts:
   - 0 Critical
   - 1 High
   - 12 Medium
   - 11 Low

---

## If Still Not Working

### Copy from Browser Console

1. Open DevTools Console (F12)
2. Run:
   ```javascript
   console.log(window.location.href)
   console.log(document.querySelector('[class*="repoId"]'))
   ```

3. Copy the output and send to me

### Check API Response

1. Go to Network tab
2. Find the `/results` request
3. Right-click → Copy → Copy Response
4. Send me the response

---

## Manual Test

Try this in browser console:

```javascript
// Test API directly
fetch('http://localhost:8000/api/v1/analysis/repositories/e17246a6-d061-4001-95dd-ed175d5e30b3/results', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
  }
})
.then(r => r.json())
.then(data => {
  console.log('Issues count:', data.issues?.length || 0)
  console.log('First 3 issues:', data.issues?.slice(0, 3))
})
```

**Expected output:**
```
Issues count: 24
First 3 issues: [...]
```

---

## Most Likely Cause

Based on the screenshot showing "0 found", the most likely causes are:

1. **Wrong URL** - Not at `/dashboard/:id/issues`
2. **Missing repo ID** - URL doesn't have the repository ID
3. **Stale cache** - Old cached data showing 0 issues
4. **API not called** - Frontend logic not executing fetch

**Quick test:** Click on the repo name "CineMatch_Chatbot" in the header and see if it navigates correctly.
