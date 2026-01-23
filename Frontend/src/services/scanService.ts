// Scan and storage service for RepoIQ
export interface ScanIssue {
  id: number;
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  description: string;
  details: string;
  fix: string;
}

export interface ScanResult {
  id: string;
  timestamp: number;
  repoName: string;
  branch: string;
  issues: ScanIssue[];
  stats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

export interface BugReport {
  id: number | string;
  title: string;
  details: string;
  timestamp: number;
  repoName: string;
  severity?: "critical" | "high" | "medium" | "low";
  status?: "open" | "triaged" | "in_progress" | "resolved";
  category?: string;
  file_path?: string;
  line_number?: number;
}

const STORAGE_KEYS = {
  SCANS: "repoiq_scans",
  BUG_REPORTS: "repoiq_bug_reports",
  USER_ROLE: "repoiq_user_role",
};

// Mock issue templates for realistic scan generation
const issueTemplates = [
  {
    file: "src/api/auth.ts",
    severity: "critical" as const,
    type: "Security",
    description: "Potential SQL injection vulnerability",
    details: "User input is directly concatenated into SQL query without proper sanitization.",
    fix: `// Before:
const query = "SELECT * FROM users WHERE id = " + userId;

// After (using parameterized queries):
const query = "SELECT * FROM users WHERE id = $1";
const result = await db.query(query, [userId]);`,
  },
  {
    file: "src/services/data.ts",
    severity: "high" as const,
    type: "Security",
    description: "Sensitive data exposed in logs",
    details: "Password field is being logged in plain text.",
    fix: `// Before:
console.log("User login:", { email, password });

// After:
console.log("User login:", { email, password: "[REDACTED]" });`,
  },
  {
    file: "src/utils/helpers.ts",
    severity: "medium" as const,
    type: "Quality",
    description: "Function complexity exceeds threshold",
    details: "Cyclomatic complexity of 15 exceeds the recommended maximum of 10.",
    fix: `// Consider breaking down the function into smaller, more focused functions:

function validateUser(user) {
  return validateEmail(user.email) && validatePassword(user.password);
}`,
  },
  {
    file: "src/components/Form.tsx",
    severity: "low" as const,
    type: "Naming",
    description: "Variable name does not follow conventions",
    details: 'Variable "x" should have a more descriptive name.',
    fix: `// Before:
const x = formData.values;

// After:
const formValues = formData.values;`,
  },
  {
    file: "src/hooks/useAuth.ts",
    severity: "medium" as const,
    type: "Architecture",
    description: "Missing error boundary handling",
    details: "Async operation lacks proper error handling.",
    fix: `// Before:
const data = await fetchUser();

// After:
try {
  const data = await fetchUser();
} catch (error) {
  handleError(error);
  throw error;
}`,
  },
  {
    file: "src/api/users.ts",
    severity: "high" as const,
    type: "Security",
    description: "Missing authentication check",
    details: "Endpoint allows unauthenticated access to sensitive user data.",
    fix: `// Add authentication middleware:
router.get('/users/:id', authenticateUser, async (req, res) => {
  // Handler code
});`,
  },
  {
    file: "src/utils/validation.ts",
    severity: "medium" as const,
    type: "Quality",
    description: "Inefficient algorithm detected",
    details: "O(n²) complexity can be optimized to O(n) using a Set.",
    fix: `// Before:
const duplicates = arr.filter((item, index) => arr.indexOf(item) !== index);

// After:
const seen = new Set();
const duplicates = arr.filter(item => seen.has(item) ? true : (seen.add(item), false));`,
  },
  {
    file: "src/components/Dashboard.tsx",
    severity: "low" as const,
    type: "Performance",
    description: "Missing React.memo optimization",
    details: "Component re-renders unnecessarily on parent updates.",
    fix: `// Wrap component with memo:
export const Dashboard = React.memo(({ data }) => {
  // Component code
});`,
  },
];

// Generate a realistic scan with random issues
export function generateMockScan(repoName: string, branch: string): ScanResult {
  const numIssues = Math.floor(Math.random() * 8) + 5; // 5-12 issues
  const selectedIssues: ScanIssue[] = [];
  
  for (let i = 0; i < numIssues; i++) {
    const template = issueTemplates[Math.floor(Math.random() * issueTemplates.length)];
    selectedIssues.push({
      ...template,
      id: Date.now() + i,
      line: Math.floor(Math.random() * 200) + 1,
    });
  }

  const stats = {
    critical: selectedIssues.filter((i) => i.severity === "critical").length,
    high: selectedIssues.filter((i) => i.severity === "high").length,
    medium: selectedIssues.filter((i) => i.severity === "medium").length,
    low: selectedIssues.filter((i) => i.severity === "low").length,
    total: selectedIssues.length,
  };

  return {
    id: `scan_${Date.now()}`,
    timestamp: Date.now(),
    repoName,
    branch,
    issues: selectedIssues,
    stats,
  };
}

// LocalStorage operations
export const scanStorage = {
  getScans(): ScanResult[] {
    const data = localStorage.getItem(STORAGE_KEYS.SCANS);
    return data ? JSON.parse(data) : [];
  },

  saveScan(scan: ScanResult): void {
    const scans = this.getScans();
    scans.unshift(scan); // Add to beginning
    // Keep only last 20 scans
    if (scans.length > 20) scans.pop();
    localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(scans));
  },

  getLatestScan(): ScanResult | null {
    const scans = this.getScans();
    return scans.length > 0 ? scans[0] : null;
  },

  clearScans(): void {
    localStorage.removeItem(STORAGE_KEYS.SCANS);
  },
};

export const bugReportStorage = {
  getReports(): BugReport[] {
    const data = localStorage.getItem(STORAGE_KEYS.BUG_REPORTS);
    return data ? JSON.parse(data) : [];
  },

  saveReport(report: BugReport): void {
    const reports = this.getReports();
    reports.unshift({
      status: "open",
      severity: "medium",
      ...report,
    });
    // Keep only last 50 reports
    if (reports.length > 50) reports.pop();
    localStorage.setItem(STORAGE_KEYS.BUG_REPORTS, JSON.stringify(reports));
  },

  clearReports(): void {
    localStorage.removeItem(STORAGE_KEYS.BUG_REPORTS);
  },
};

export const userRoleStorage = {
  getRole(): "owner" {
    return "owner";
  },

  setRole(_: "owner"): void {
    // no-op for owner-only app, keep storage for compatibility
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, "owner");
  },
};

// Simulate async scan (with delay for realism)
export async function runScan(repoName: string, branch: string): Promise<ScanResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));
  
  const scan = generateMockScan(repoName, branch);
  scanStorage.saveScan(scan);
  
  return scan;
}

// Initialize with dummy data if storage is empty
export function initializeDummyData(): void {
  const existingScans = scanStorage.getScans();
  
  if (existingScans.length === 0) {
    // Create 3 dummy scans with different timestamps
    const now = Date.now();
    
    // Scan 1 (most recent - 2 hours ago)
    const scan1 = generateMockScan("Dashboard", "main");
    scan1.timestamp = now - 2 * 60 * 60 * 1000;
    scan1.id = `scan_${scan1.timestamp}`;
    
    // Scan 2 (1 day ago)
    const scan2 = generateMockScan("Dashboard", "main");
    scan2.timestamp = now - 24 * 60 * 60 * 1000;
    scan2.id = `scan_${scan2.timestamp}`;
    
    // Scan 3 (3 days ago)
    const scan3 = generateMockScan("Dashboard", "main");
    scan3.timestamp = now - 3 * 24 * 60 * 60 * 1000;
    scan3.id = `scan_${scan3.timestamp}`;
    
    scanStorage.saveScan(scan3);
    scanStorage.saveScan(scan2);
    scanStorage.saveScan(scan1);
  }
  
  // Add dummy bug reports if empty
  const existingReports = bugReportStorage.getReports();
  if (existingReports.length === 0) {
    const now = Date.now();
    
    bugReportStorage.saveReport({
      id: now - 1,
      title: "Memory leak in authentication module",
      details: "Users report slow performance after extended sessions.\n\nSteps to reproduce:\n1. Login to application\n2. Leave session open for 2+ hours\n3. Notice increasing memory usage\n\nExpected: Memory should remain stable\nActual: Memory increases by ~50MB per hour",
      timestamp: now - 5 * 60 * 60 * 1000, // 5 hours ago
      repoName: "Dashboard",
      severity: "high",
      status: "open",
    });
    
    bugReportStorage.saveReport({
      id: now - 2,
      title: "API timeout on large file uploads",
      details: "Files over 10MB fail to upload with timeout error.\n\nError message: 'Request timeout after 30s'\n\nSuggestion: Increase timeout or implement chunked upload",
      timestamp: now - 24 * 60 * 60 * 1000, // 1 day ago
      repoName: "Dashboard",
      severity: "medium",
      status: "triaged",
    });
  }
}

// REMOVED: Auto-initialization of dummy data
// All data should come from real API calls, not local storage mocks
// initializeDummyData(); // DISABLED - Use real data from backend
