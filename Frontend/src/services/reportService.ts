/**
 * Comprehensive Analysis Report Service
 * Generates professional PDF reports for product owners to share with developers
 */

export interface AnalysisReport {
  repository: {
    name: string;
    fullName: string;
    language?: string;
    branch?: string;
    lastAnalyzed?: string;
  };
  scores: {
    overall: number;
    security: number;
    quality: number;
    architecture: number;
    documentation: number;
  };
  summary: {
    totalIssues: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    filesAnalyzed: number;
  };
  issues: {
    id: string;
    file: string;
    line: number;
    severity: string;
    category: string;
    description: string;
    suggestion?: string;
    agentType?: string;
  }[];
  securityVulnerabilities: any[];
  qualityIssues: any[];
  architectureIssues: any[];
  bestPractices: any[];
}

// Helper function to escape HTML entities
function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

// Helper function to get severity color
function getSeverityColor(severity: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#ca8a04';
    case 'low': return '#16a34a';
    default: return '#6b7280';
  }
}

// Helper function to get severity badge HTML
function getSeverityBadge(severity: string): string {
  const color = getSeverityColor(severity);
  return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; color: white; background-color: ${color}; text-transform: uppercase;">${escapeHtml(severity || 'unknown')}</span>`;
}

// Helper function to get score color
function getScoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  if (score >= 40) return '#ea580c';
  return '#dc2626';
}

// Generate comprehensive PDF report
export function generateFullAnalysisReport(report: AnalysisReport): void {
  const timestamp = new Date().toLocaleString();
  const dateStr = new Date().toLocaleDateString();
  
  // Group issues by category
  const securityIssues = report.issues.filter(i => 
    i.agentType === 'security' || i.category?.toLowerCase().includes('security') || 
    i.category?.toLowerCase().includes('injection') || i.category?.toLowerCase().includes('vulnerability')
  );
  const qualityIssues = report.issues.filter(i => 
    i.agentType === 'quality' || i.category?.toLowerCase().includes('quality') || 
    i.category?.toLowerCase().includes('code') || i.category?.toLowerCase().includes('smell')
  );
  const architectureIssues = report.issues.filter(i => 
    i.agentType === 'architecture' || i.category?.toLowerCase().includes('architecture') || 
    i.category?.toLowerCase().includes('design') || i.category?.toLowerCase().includes('pattern')
  );
  const bestPracticeIssues = report.issues.filter(i => 
    i.category?.toLowerCase().includes('practice') || i.category?.toLowerCase().includes('best') || 
    i.category?.toLowerCase().includes('convention')
  );
  const otherIssues = report.issues.filter(i => 
    !securityIssues.includes(i) && !qualityIssues.includes(i) && 
    !architectureIssues.includes(i) && !bestPracticeIssues.includes(i)
  );

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Repository Analysis Report - ${escapeHtml(report.repository.name)}</title>
  <style>
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
      .no-break { page-break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20mm;
      color: #1f2937;
      background: #fff;
    }
    
    /* Header */
    .report-header {
      text-align: center;
      padding: 30px 0;
      border-bottom: 3px solid #2563eb;
      margin-bottom: 30px;
    }
    .report-header h1 {
      font-size: 28px;
      color: #1e40af;
      margin: 0 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .report-header .repo-name {
      font-size: 24px;
      color: #374151;
      margin: 10px 0;
      font-weight: 600;
    }
    .report-header .meta {
      font-size: 12px;
      color: #6b7280;
    }
    
    /* Scores Section */
    .scores-section {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 25px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .scores-section h2 {
      margin: 0 0 20px 0;
      font-size: 18px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .scores-grid {
      display: flex;
      justify-content: space-around;
      flex-wrap: wrap;
      gap: 15px;
    }
    .score-item {
      text-align: center;
      min-width: 100px;
    }
    .score-value {
      font-size: 36px;
      font-weight: bold;
    }
    .score-label {
      font-size: 12px;
      opacity: 0.9;
      text-transform: uppercase;
    }
    
    /* Summary Section */
    .summary-section {
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .summary-section h2 {
      margin: 0 0 15px 0;
      color: #1e40af;
      font-size: 18px;
      border-bottom: 2px solid #1e40af;
      padding-bottom: 10px;
    }
    .summary-grid {
      display: flex;
      justify-content: space-around;
      flex-wrap: wrap;
      gap: 15px;
    }
    .summary-item {
      text-align: center;
      padding: 15px 20px;
      background: white;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      min-width: 100px;
    }
    .summary-item .count {
      font-size: 28px;
      font-weight: bold;
    }
    .summary-item .label {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
    }
    
    /* Section Headers */
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #1e40af;
      font-size: 20px;
      margin: 0 0 15px 0;
      padding: 10px 15px;
      background: #eff6ff;
      border-left: 4px solid #2563eb;
      border-radius: 0 8px 8px 0;
    }
    .section-count {
      float: right;
      font-size: 14px;
      color: #6b7280;
      font-weight: normal;
    }
    
    /* Issue Cards */
    .issue-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .issue-header {
      background: #f8fafc;
      padding: 12px 15px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .issue-file {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      color: #374151;
      font-weight: 600;
    }
    .issue-line {
      font-size: 11px;
      color: #6b7280;
      margin-left: 10px;
    }
    .issue-body {
      padding: 15px;
    }
    .issue-description {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 10px;
      line-height: 1.5;
    }
    .issue-suggestion {
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 13px;
      color: #166534;
    }
    .issue-suggestion::before {
      content: "💡 Suggestion: ";
      font-weight: bold;
    }
    
    /* No Issues Message */
    .no-issues {
      text-align: center;
      padding: 30px;
      color: #16a34a;
      background: #f0fdf4;
      border-radius: 8px;
      border: 1px solid #86efac;
    }
    .no-issues::before {
      content: "✅ ";
    }
    
    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #6b7280;
      font-size: 11px;
    }
    .report-footer .logo {
      font-size: 16px;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 5px;
    }
    
    /* Table of Contents */
    .toc {
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 1px solid #e2e8f0;
    }
    .toc h2 {
      margin: 0 0 15px 0;
      color: #1e40af;
      font-size: 16px;
    }
    .toc ul {
      margin: 0;
      padding-left: 20px;
    }
    .toc li {
      margin: 8px 0;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="report-header">
    <h1>📊 Repository Analysis Report</h1>
    <div class="repo-name">${escapeHtml(report.repository.fullName || report.repository.name)}</div>
    <div class="meta">
      ${report.repository.language ? `Language: ${escapeHtml(report.repository.language)} | ` : ''}
      ${report.repository.branch ? `Branch: ${escapeHtml(report.repository.branch)} | ` : ''}
      Generated: ${timestamp}
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc no-break">
    <h2>📋 Table of Contents</h2>
    <ul>
      <li>Analysis Scores Overview</li>
      <li>Issues Summary</li>
      <li>🔒 Security Vulnerabilities (${securityIssues.length})</li>
      <li>📝 Code Quality Issues (${qualityIssues.length})</li>
      <li>🏗️ Architecture Issues (${architectureIssues.length})</li>
      <li>✅ Best Practices (${bestPracticeIssues.length})</li>
      ${otherIssues.length > 0 ? `<li>📌 Other Issues (${otherIssues.length})</li>` : ''}
    </ul>
  </div>

  <!-- Scores Section -->
  <div class="scores-section no-break">
    <h2>📈 Analysis Scores</h2>
    <div class="scores-grid">
      <div class="score-item">
        <div class="score-value">${report.scores.overall}</div>
        <div class="score-label">Overall</div>
      </div>
      <div class="score-item">
        <div class="score-value">${report.scores.security}</div>
        <div class="score-label">Security</div>
      </div>
      <div class="score-item">
        <div class="score-value">${report.scores.quality}</div>
        <div class="score-label">Quality</div>
      </div>
      <div class="score-item">
        <div class="score-value">${report.scores.architecture}</div>
        <div class="score-label">Architecture</div>
      </div>
      <div class="score-item">
        <div class="score-value">${report.scores.documentation}</div>
        <div class="score-label">Documentation</div>
      </div>
    </div>
  </div>

  <!-- Summary Section -->
  <div class="summary-section no-break">
    <h2>📊 Issues Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="count" style="color: #1e40af;">${report.summary.totalIssues}</div>
        <div class="label">Total Issues</div>
      </div>
      <div class="summary-item">
        <div class="count" style="color: #dc2626;">${report.summary.criticalCount}</div>
        <div class="label">Critical</div>
      </div>
      <div class="summary-item">
        <div class="count" style="color: #ea580c;">${report.summary.highCount}</div>
        <div class="label">High</div>
      </div>
      <div class="summary-item">
        <div class="count" style="color: #ca8a04;">${report.summary.mediumCount}</div>
        <div class="label">Medium</div>
      </div>
      <div class="summary-item">
        <div class="count" style="color: #16a34a;">${report.summary.lowCount}</div>
        <div class="label">Low</div>
      </div>
      <div class="summary-item">
        <div class="count" style="color: #6b7280;">${report.summary.filesAnalyzed}</div>
        <div class="label">Files Analyzed</div>
      </div>
    </div>
  </div>

  <!-- Security Vulnerabilities Section -->
  <div class="section page-break">
    <h2>🔒 Security Vulnerabilities <span class="section-count">${securityIssues.length} issues</span></h2>
    ${securityIssues.length === 0 
      ? '<div class="no-issues">No security vulnerabilities detected</div>'
      : securityIssues.map(issue => `
        <div class="issue-card no-break">
          <div class="issue-header">
            <div>
              <span class="issue-file">${escapeHtml(issue.file)}</span>
              <span class="issue-line">Line ${issue.line || 'N/A'}</span>
            </div>
            ${getSeverityBadge(issue.severity)}
          </div>
          <div class="issue-body">
            <div class="issue-description">${escapeHtml(issue.description)}</div>
            ${issue.suggestion ? `<div class="issue-suggestion">${escapeHtml(issue.suggestion)}</div>` : ''}
          </div>
        </div>
      `).join('')
    }
  </div>

  <!-- Code Quality Section -->
  <div class="section page-break">
    <h2>📝 Code Quality Issues <span class="section-count">${qualityIssues.length} issues</span></h2>
    ${qualityIssues.length === 0 
      ? '<div class="no-issues">No code quality issues detected</div>'
      : qualityIssues.map(issue => `
        <div class="issue-card no-break">
          <div class="issue-header">
            <div>
              <span class="issue-file">${escapeHtml(issue.file)}</span>
              <span class="issue-line">Line ${issue.line || 'N/A'}</span>
            </div>
            ${getSeverityBadge(issue.severity)}
          </div>
          <div class="issue-body">
            <div class="issue-description">${escapeHtml(issue.description)}</div>
            ${issue.suggestion ? `<div class="issue-suggestion">${escapeHtml(issue.suggestion)}</div>` : ''}
          </div>
        </div>
      `).join('')
    }
  </div>

  <!-- Architecture Section -->
  <div class="section page-break">
    <h2>🏗️ Architecture Issues <span class="section-count">${architectureIssues.length} issues</span></h2>
    ${architectureIssues.length === 0 
      ? '<div class="no-issues">No architecture issues detected</div>'
      : architectureIssues.map(issue => `
        <div class="issue-card no-break">
          <div class="issue-header">
            <div>
              <span class="issue-file">${escapeHtml(issue.file)}</span>
              <span class="issue-line">Line ${issue.line || 'N/A'}</span>
            </div>
            ${getSeverityBadge(issue.severity)}
          </div>
          <div class="issue-body">
            <div class="issue-description">${escapeHtml(issue.description)}</div>
            ${issue.suggestion ? `<div class="issue-suggestion">${escapeHtml(issue.suggestion)}</div>` : ''}
          </div>
        </div>
      `).join('')
    }
  </div>

  <!-- Best Practices Section -->
  <div class="section page-break">
    <h2>✅ Best Practices <span class="section-count">${bestPracticeIssues.length} suggestions</span></h2>
    ${bestPracticeIssues.length === 0 
      ? '<div class="no-issues">All best practices are being followed</div>'
      : bestPracticeIssues.map(issue => `
        <div class="issue-card no-break">
          <div class="issue-header">
            <div>
              <span class="issue-file">${escapeHtml(issue.file)}</span>
              <span class="issue-line">Line ${issue.line || 'N/A'}</span>
            </div>
            ${getSeverityBadge(issue.severity)}
          </div>
          <div class="issue-body">
            <div class="issue-description">${escapeHtml(issue.description)}</div>
            ${issue.suggestion ? `<div class="issue-suggestion">${escapeHtml(issue.suggestion)}</div>` : ''}
          </div>
        </div>
      `).join('')
    }
  </div>

  ${otherIssues.length > 0 ? `
  <!-- Other Issues Section -->
  <div class="section page-break">
    <h2>📌 Other Issues <span class="section-count">${otherIssues.length} issues</span></h2>
    ${otherIssues.map(issue => `
      <div class="issue-card no-break">
        <div class="issue-header">
          <div>
            <span class="issue-file">${escapeHtml(issue.file)}</span>
            <span class="issue-line">Line ${issue.line || 'N/A'}</span>
          </div>
          ${getSeverityBadge(issue.severity)}
        </div>
        <div class="issue-body">
          <div class="issue-description">${escapeHtml(issue.description)}</div>
          ${issue.suggestion ? `<div class="issue-suggestion">${escapeHtml(issue.suggestion)}</div>` : ''}
        </div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="report-footer">
    <div class="logo">⚡ RepoIQ</div>
    <p>Automated Code Analysis Report | Generated on ${dateStr}</p>
    <p>This report is confidential and intended for development team use only.</p>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>
  `.trim();

  // Open in new window for print/PDF
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

// Generate Bug Report PDF with professional template
export function generateBugReportPDF(reports: any[], repoName: string): void {
  const timestamp = new Date().toLocaleString();
  const dateStr = new Date().toLocaleDateString();
  
  // Calculate stats
  const criticalCount = reports.filter(r => r.severity === 'critical').length;
  const highCount = reports.filter(r => r.severity === 'high').length;
  const mediumCount = reports.filter(r => r.severity === 'medium').length;
  const lowCount = reports.filter(r => r.severity === 'low').length;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bug Report - ${escapeHtml(repoName)}</title>
  <style>
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page-break { page-break-before: always; }
      .no-break { page-break-inside: avoid; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20mm;
      color: #1f2937;
      background: #fff;
    }
    
    .report-header {
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      text-align: center;
    }
    .report-header h1 {
      font-size: 28px;
      margin: 0 0 10px 0;
    }
    .report-header .repo-name {
      font-size: 20px;
      opacity: 0.9;
    }
    .report-header .meta {
      font-size: 12px;
      opacity: 0.8;
      margin-top: 15px;
    }
    
    .stats-bar {
      display: flex;
      justify-content: space-around;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .stat-item {
      text-align: center;
    }
    .stat-item .count {
      font-size: 32px;
      font-weight: bold;
    }
    .stat-item .label {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
    }
    
    .bug-card {
      border: 2px solid #fecaca;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .bug-header {
      background: #fef2f2;
      padding: 15px 20px;
      border-bottom: 1px solid #fecaca;
    }
    .bug-title {
      font-size: 16px;
      font-weight: 600;
      color: #991b1b;
      margin: 0 0 8px 0;
    }
    .bug-meta {
      font-size: 12px;
      color: #6b7280;
    }
    .bug-body {
      padding: 20px;
    }
    .bug-details {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
      font-family: 'Consolas', monospace;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .severity-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      color: white;
    }
    .severity-critical { background: #dc2626; }
    .severity-high { background: #ea580c; }
    .severity-medium { background: #ca8a04; }
    .severity-low { background: #16a34a; }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      color: #6b7280;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>🐛 Bug Report</h1>
    <div class="repo-name">${escapeHtml(repoName)}</div>
    <div class="meta">Generated: ${timestamp} | Total Bugs: ${reports.length}</div>
  </div>

  <div class="stats-bar no-break">
    <div class="stat-item">
      <div class="count" style="color: #1e40af;">${reports.length}</div>
      <div class="label">Total Bugs</div>
    </div>
    <div class="stat-item">
      <div class="count" style="color: #dc2626;">${criticalCount}</div>
      <div class="label">Critical</div>
    </div>
    <div class="stat-item">
      <div class="count" style="color: #ea580c;">${highCount}</div>
      <div class="label">High</div>
    </div>
    <div class="stat-item">
      <div class="count" style="color: #ca8a04;">${mediumCount}</div>
      <div class="label">Medium</div>
    </div>
    <div class="stat-item">
      <div class="count" style="color: #16a34a;">${lowCount}</div>
      <div class="label">Low</div>
    </div>
  </div>

  ${reports.length === 0 
    ? '<div style="text-align: center; padding: 40px; background: #f0fdf4; border-radius: 12px; color: #16a34a;">✅ No bugs found! Great job!</div>'
    : reports.map((bug, index) => `
      <div class="bug-card no-break">
        <div class="bug-header">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <div class="bug-title">#${index + 1}: ${escapeHtml(bug.title || bug.description || 'Issue')}</div>
              <div class="bug-meta">
                ${bug.file_path ? `File: ${escapeHtml(bug.file_path)}` : ''}
                ${bug.line_number ? ` | Line: ${bug.line_number}` : ''}
                ${bug.category ? ` | Category: ${escapeHtml(bug.category)}` : ''}
              </div>
            </div>
            <span class="severity-badge severity-${(bug.severity || 'medium').toLowerCase()}">${escapeHtml(bug.severity || 'medium')}</span>
          </div>
        </div>
        <div class="bug-body">
          <div class="bug-details">${escapeHtml(bug.details || bug.description || 'No details available')}</div>
        </div>
      </div>
    `).join('')
  }

  <div class="footer">
    <div style="font-size: 16px; font-weight: bold; color: #dc2626; margin-bottom: 5px;">⚡ RepoIQ Bug Report</div>
    <p>Generated on ${dateStr} | Please address critical and high severity bugs first</p>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>
  `.trim();

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
