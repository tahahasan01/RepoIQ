# Test: Verify Issues in Database

## Quick Test - Run This in Browser Console

```javascript
// Test 1: Fetch issues directly by analysis ID
const analysisId = '0c19fd8f-9a34-4f6a-ae68-5e7f7290f32f';
const token = localStorage.getItem('auth_token');

fetch(`http://localhost:8000/api/v1/analysis/${analysisId}/issues`, {
  headers: {'Authorization': `Bearer ${token}`}
})
.then(r => r.json())
.then(issues => {
  console.log('✅ DIRECT FETCH - Issues in DB:', issues?.length || 0);
  console.log('First 3 issues:', issues?.slice(0, 3));
  if (issues && issues.length > 0) {
    alert(`SUCCESS! Database has ${issues.length} issues for this analysis!`);
  } else {
    alert('ERROR: Database has 0 issues!');
  }
})
.catch(err => console.error('❌ Error:', err));
```

## Expected Output

If issues ARE in database:
```
✅ DIRECT FETCH - Issues in DB: 24
First 3 issues: [{...}, {...}, {...}]
Alert: "SUCCESS! Database has 24 issues for this analysis!"
```

If issues are NOT in database:
```
✅ DIRECT FETCH - Issues in DB: 0
Alert: "ERROR: Database has 0 issues!"
```

## Test 2: Check Latest Analysis Issues

```javascript
const repoId = 'e17246a6-d061-4001-95dd-ed175d5e30b3';
const token = localStorage.getItem('auth_token');

// First, get latest analysis
fetch(`http://localhost:8000/api/v1/analysis/repositories/${repoId}/results`, {
  headers: {'Authorization': `Bearer ${token}`}
})
.then(r => r.json())
.then(data => {
  console.log('Analysis ID:', data.id);
  console.log('Analysis status:', data.status);
  console.log('Issues in response:', data.issues?.length || 0);
  console.log('Total issues field:', data.total_issues);
  
  if (data.issues && data.issues.length > 0) {
    console.log('✅ Issues ARE being returned!');
    console.log('First 3 issues:', data.issues.slice(0, 3));
  } else {
    console.log('❌ No issues in response!');
    console.log('Full response:', data);
    
    // Try direct fetch with this analysis ID
    return fetch(`http://localhost:8000/api/v1/analysis/${data.id}/issues`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
  }
})
.then(r => r?.json())
.then(issues => {
  if (issues) {
    console.log('DIRECT FETCH result:', issues?.length || 0);
  }
});
```

---

## Backend Verification

Check backend logs for these patterns:

### Pattern 1: Issues Being Saved
```
💾 Saving 24 issues for analysis 0c19fd8f-...
✅ Successfully saved 24 issues to database
```

### Pattern 2: Issues Being Retrieved
```
[get_issues] Found 24 issues for analysis 0c19fd8f-...
✓ Pre-cached 24 issues
```

---

## If Issues Are NOT in Database

The problem could be:

1. **Save failed silently** - Check for error logs
2. **Wrong analysis ID** - Issues saved to different analysis
3. **Database constraint** - Check for validation errors
4. **Transaction rollback** - Check for uncaught exceptions

---

## Run This Test Now

1. Open browser at Issues page
2. Press F12 (DevTools)
3. Go to Console tab
4. Paste Test 1 code
5. Press Enter
6. Check the output

**Send me the results!**
