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

// Generate comprehensive PDF report - Print-Ready Format
export function generateFullAnalysisReport(report: AnalysisReport): void {
  const timestamp = new Date().toLocaleString();
  const dateStr = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  });
  
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

  // Generate issue sections HTML
  const generateIssueSection = (issues: any[], title: string, icon: string, colorClass: string) => {
    if (issues.length === 0) {
      return `
        <div class="section-card no-issues-card">
          <div class="section-header ${colorClass}">
            <span class="section-icon">${icon}</span>
            <span class="section-title">${title}</span>
            <span class="section-count">0 issues</span>
          </div>
          <div class="no-issues-content">
            <span class="check-icon">✓</span>
            <p>No issues detected in this category</p>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="section-card">
        <div class="section-header ${colorClass}">
          <span class="section-icon">${icon}</span>
          <span class="section-title">${title}</span>
          <span class="section-count">${issues.length} issue${issues.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="issues-list">
          ${issues.map((issue, idx) => `
            <div class="issue-item">
              <div class="issue-number">${idx + 1}</div>
              <div class="issue-content">
                <div class="issue-location">
                  <span class="file-name">${escapeHtml(issue.file)}</span>
                  ${issue.line ? `<span class="line-number">Line ${issue.line}</span>` : ''}
                  ${getSeverityBadge(issue.severity)}
                </div>
                <div class="issue-description">${escapeHtml(issue.description)}</div>
                ${issue.suggestion ? `
                  <div class="issue-suggestion">
                    <span class="suggestion-label">Recommendation:</span>
                    ${escapeHtml(issue.suggestion)}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repository Analysis Report - ${escapeHtml(report.repository.name)}</title>
  <style>
    /* ===== Print-Optimized Styles ===== */
    @page {
      size: A4;
      margin: 15mm 15mm 20mm 15mm;
    }
    
    @media print {
      html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
      .no-break { page-break-inside: avoid; }
      .page-break-before { page-break-before: always; }
    }
    
    /* ===== Base Styles ===== */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
    }
    
    .page {
      width: 100%;
      min-height: 100vh;
      padding: 0;
      background: white;
    }
    
    /* ===== Cover Page ===== */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      text-align: center;
      padding: 40px;
    }
    
    .cover-logo {
      font-size: 48pt;
      margin-bottom: 20px;
    }
    
    .cover-title {
      font-size: 28pt;
      font-weight: 700;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 10px;
    }
    
    .cover-subtitle {
      font-size: 14pt;
      color: #64748b;
      margin-bottom: 50px;
    }
    
    .cover-repo-name {
      font-size: 22pt;
      font-weight: 600;
      color: #0f172a;
      padding: 20px 40px;
      border: 3px solid #1e40af;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    
    .cover-meta {
      font-size: 11pt;
      color: #64748b;
      line-height: 1.8;
    }
    
    .cover-meta strong {
      color: #374151;
    }
    
    .cover-date {
      margin-top: 60px;
      margin-bottom: 50px;
      font-size: 10pt;
      color: #94a3b8;
    }
    
    .cover-footer {
      margin-top: auto;
      padding-top: 30px;
      border-top: 1px solid #e2e8f0;
      font-size: 9pt;
      color: #94a3b8;
      width: 100%;
    }
    
    .cover-footer .footer-logo {
      font-size: 10pt;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 3px;
    }
    
    /* ===== Executive Summary Page ===== */
    .summary-page {
      padding: 40px;
    }
    
    .page-title {
      font-size: 18pt;
      font-weight: 700;
      color: #1e40af;
      border-bottom: 3px solid #1e40af;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    
    /* Score Cards */
    .scores-container {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      color: white;
    }
    
    .scores-title {
      font-size: 12pt;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.9;
      margin-bottom: 20px;
      text-align: center;
    }
    
    .scores-grid {
      display: flex;
      justify-content: space-between;
      gap: 15px;
    }
    
    .score-card {
      flex: 1;
      text-align: center;
      padding: 15px 10px;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
    }
    
    .score-value {
      font-size: 32pt;
      font-weight: 700;
      line-height: 1;
    }
    
    .score-label {
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.9;
      margin-top: 8px;
    }
    
    /* Issues Summary */
    .summary-grid {
      display: flex;
      gap: 15px;
      margin-bottom: 30px;
    }
    
    .summary-card {
      flex: 1;
      text-align: center;
      padding: 20px 15px;
      border-radius: 8px;
      border: 2px solid;
    }
    
    .summary-card.total { border-color: #3b82f6; background: #eff6ff; }
    .summary-card.critical { border-color: #dc2626; background: #fef2f2; }
    .summary-card.high { border-color: #ea580c; background: #fff7ed; }
    .summary-card.medium { border-color: #ca8a04; background: #fefce8; }
    .summary-card.low { border-color: #16a34a; background: #f0fdf4; }
    .summary-card.files { border-color: #6b7280; background: #f9fafb; }
    
    .summary-value {
      font-size: 28pt;
      font-weight: 700;
      line-height: 1;
    }
    
    .summary-card.total .summary-value { color: #1d4ed8; }
    .summary-card.critical .summary-value { color: #dc2626; }
    .summary-card.high .summary-value { color: #ea580c; }
    .summary-card.medium .summary-value { color: #ca8a04; }
    .summary-card.low .summary-value { color: #16a34a; }
    .summary-card.files .summary-value { color: #4b5563; }
    
    .summary-label {
      font-size: 9pt;
      text-transform: uppercase;
      color: #64748b;
      margin-top: 8px;
    }
    
    /* Table of Contents */
    .toc-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 25px;
    }
    
    .toc-title {
      font-size: 12pt;
      font-weight: 600;
      color: #1e40af;
      margin-bottom: 15px;
    }
    
    .toc-list {
      list-style: none;
    }
    
    .toc-item {
      padding: 8px 0;
      border-bottom: 1px dotted #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10pt;
    }
    
    .toc-item:last-child {
      border-bottom: none;
    }
    
    .toc-item-name {
      color: #374151;
    }
    
    .toc-item-count {
      color: #64748b;
      font-weight: 500;
    }
    
    /* ===== Issues Pages ===== */
    .issues-page {
      padding: 40px;
    }
    
    .section-card {
      margin-bottom: 30px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    
    .section-header {
      padding: 15px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: white;
    }
    
    .section-header.security { background: linear-gradient(90deg, #dc2626, #f87171); }
    .section-header.quality { background: linear-gradient(90deg, #2563eb, #60a5fa); }
    .section-header.architecture { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
    .section-header.bestpractice { background: linear-gradient(90deg, #16a34a, #4ade80); }
    .section-header.other { background: linear-gradient(90deg, #64748b, #94a3b8); }
    
    .section-icon {
      font-size: 16pt;
    }
    
    .section-title {
      flex: 1;
      font-size: 13pt;
      font-weight: 600;
    }
    
    .section-count {
      font-size: 10pt;
      opacity: 0.9;
    }
    
    .issues-list {
      padding: 15px;
    }
    
    .issue-item {
      display: flex;
      gap: 15px;
      padding: 15px;
      background: #f8fafc;
      border-radius: 6px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    
    .issue-item:last-child {
      margin-bottom: 0;
    }
    
    .issue-number {
      width: 28px;
      height: 28px;
      background: #e2e8f0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      font-weight: 600;
      color: #64748b;
      flex-shrink: 0;
    }
    
    .issue-content {
      flex: 1;
    }
    
    .issue-location {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    
    .file-name {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 9pt;
      font-weight: 600;
      color: #1e40af;
      background: #eff6ff;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    .line-number {
      font-size: 9pt;
      color: #64748b;
    }
    
    .issue-description {
      font-size: 10pt;
      color: #374151;
      line-height: 1.5;
      margin-bottom: 8px;
    }
    
    .issue-suggestion {
      font-size: 9pt;
      color: #166534;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 4px;
      padding: 8px 12px;
    }
    
    .suggestion-label {
      font-weight: 600;
      margin-right: 5px;
    }
    
    /* Severity Badges */
    .severity-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: white;
    }
    
    .severity-critical { background: #dc2626; }
    .severity-high { background: #ea580c; }
    .severity-medium { background: #ca8a04; }
    .severity-low { background: #16a34a; }
    
    /* No Issues Card */
    .no-issues-card .no-issues-content {
      padding: 40px;
      text-align: center;
      color: #16a34a;
    }
    
    .check-icon {
      display: block;
      font-size: 24pt;
      margin-bottom: 10px;
    }
    
    /* ===== Footer ===== */
    .page-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 8pt;
      color: #94a3b8;
    }
    
    .footer-logo {
      font-size: 11pt;
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 5px;
    }
  </style>
</head>
<body>
  <!-- ===== PAGE 1: Cover Page ===== -->
  <div class="page cover-page">
    <div class="cover-logo">📊</div>
    <div class="cover-title">Repository Analysis Report</div>
    <div class="cover-subtitle">Comprehensive Code Quality Assessment</div>
    
    <div class="cover-repo-name">${escapeHtml(report.repository.fullName || report.repository.name)}</div>
    
    <div class="cover-meta">
      ${report.repository.language ? `<div><strong>Language:</strong> ${escapeHtml(report.repository.language)}</div>` : ''}
      ${report.repository.branch ? `<div><strong>Branch:</strong> ${escapeHtml(report.repository.branch)}</div>` : ''}
      <div><strong>Total Issues Found:</strong> ${report.summary.totalIssues}</div>
      <div><strong>Files Analyzed:</strong> ${report.summary.filesAnalyzed}</div>
    </div>
    
    <div class="cover-date">
      <div>Generated on ${dateStr}</div>
      <div>${timestamp}</div>
    </div>
    
    <div class="cover-footer">
      <div class="footer-logo">⚡ RepoIQ</div>
      Automated Code Analysis Platform
    </div>
  </div>

  <!-- ===== PAGE 2: Executive Summary ===== -->
  <div class="page summary-page">
    <div class="page-title">📈 Executive Summary</div>
    
    <!-- Scores -->
    <div class="scores-container no-break">
      <div class="scores-title">Analysis Scores</div>
      <div class="scores-grid">
        <div class="score-card">
          <div class="score-value">${report.scores.overall}</div>
          <div class="score-label">Overall</div>
        </div>
        <div class="score-card">
          <div class="score-value">${report.scores.security}</div>
          <div class="score-label">Security</div>
        </div>
        <div class="score-card">
          <div class="score-value">${report.scores.quality}</div>
          <div class="score-label">Quality</div>
        </div>
        <div class="score-card">
          <div class="score-value">${report.scores.architecture}</div>
          <div class="score-label">Architecture</div>
        </div>
        <div class="score-card">
          <div class="score-value">${report.scores.documentation}</div>
          <div class="score-label">Documentation</div>
        </div>
      </div>
    </div>
    
    <!-- Issues Summary -->
    <div class="summary-grid no-break">
      <div class="summary-card total">
        <div class="summary-value">${report.summary.totalIssues}</div>
        <div class="summary-label">Total Issues</div>
      </div>
      <div class="summary-card critical">
        <div class="summary-value">${report.summary.criticalCount}</div>
        <div class="summary-label">Critical</div>
      </div>
      <div class="summary-card high">
        <div class="summary-value">${report.summary.highCount}</div>
        <div class="summary-label">High</div>
      </div>
      <div class="summary-card medium">
        <div class="summary-value">${report.summary.mediumCount}</div>
        <div class="summary-label">Medium</div>
      </div>
      <div class="summary-card low">
        <div class="summary-value">${report.summary.lowCount}</div>
        <div class="summary-label">Low</div>
      </div>
      <div class="summary-card files">
        <div class="summary-value">${report.summary.filesAnalyzed}</div>
        <div class="summary-label">Files</div>
      </div>
    </div>
    
    <!-- Table of Contents -->
    <div class="toc-box no-break">
      <div class="toc-title">📋 Report Contents</div>
      <ul class="toc-list">
        <li class="toc-item">
          <span class="toc-item-name">🔒 Security Vulnerabilities</span>
          <span class="toc-item-count">${securityIssues.length} issues</span>
        </li>
        <li class="toc-item">
          <span class="toc-item-name">📝 Code Quality Issues</span>
          <span class="toc-item-count">${qualityIssues.length} issues</span>
        </li>
        <li class="toc-item">
          <span class="toc-item-name">🏗️ Architecture Issues</span>
          <span class="toc-item-count">${architectureIssues.length} issues</span>
        </li>
        <li class="toc-item">
          <span class="toc-item-name">✅ Best Practice Suggestions</span>
          <span class="toc-item-count">${bestPracticeIssues.length} issues</span>
        </li>
        ${otherIssues.length > 0 ? `
        <li class="toc-item">
          <span class="toc-item-name">📌 Other Issues</span>
          <span class="toc-item-count">${otherIssues.length} issues</span>
        </li>
        ` : ''}
      </ul>
    </div>
    
    <div class="page-footer">
      <div class="footer-logo">⚡ RepoIQ</div>
      Page 2 | Executive Summary
    </div>
  </div>

  <!-- ===== PAGE 3+: Issue Details ===== -->
  <div class="page issues-page">
    <div class="page-title">🔍 Detailed Findings</div>
    
    <!-- Security Vulnerabilities -->
    ${generateIssueSection(securityIssues, 'Security Vulnerabilities', '🔒', 'security')}
    
    <!-- Code Quality -->
    ${generateIssueSection(qualityIssues, 'Code Quality Issues', '📝', 'quality')}
    
    <div class="page-footer">
      <div class="footer-logo">⚡ RepoIQ</div>
      Security & Quality Issues
    </div>
  </div>
  
  <div class="page issues-page">
    <!-- Architecture -->
    ${generateIssueSection(architectureIssues, 'Architecture Issues', '🏗️', 'architecture')}
    
    <!-- Best Practices -->
    ${generateIssueSection(bestPracticeIssues, 'Best Practice Suggestions', '✅', 'bestpractice')}
    
    ${otherIssues.length > 0 ? generateIssueSection(otherIssues, 'Other Issues', '📌', 'other') : ''}
    
    <div class="page-footer">
      <div class="footer-logo">⚡ RepoIQ</div>
      Architecture & Best Practices | Generated ${dateStr}
    </div>
  </div>

  <script>
    // Auto-trigger print dialog
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
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

// Generate Bug Report PDF - Print-Ready Format
export function generateBugReportPDF(reports: any[], repoName: string): void {
  const timestamp = new Date().toLocaleString();
  const dateStr = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  // Calculate stats
  const criticalCount = reports.filter(r => r.severity === 'critical').length;
  const highCount = reports.filter(r => r.severity === 'high').length;
  const mediumCount = reports.filter(r => r.severity === 'medium').length;
  const lowCount = reports.filter(r => r.severity === 'low').length;

  // Group bugs by severity for organized printing
  const criticalBugs = reports.filter(r => r.severity === 'critical');
  const highBugs = reports.filter(r => r.severity === 'high');
  const mediumBugs = reports.filter(r => r.severity === 'medium');
  const lowBugs = reports.filter(r => r.severity === 'low');

  const generateBugList = (bugs: any[], severityLabel: string, colorClass: string) => {
    if (bugs.length === 0) return '';
    
    return `
      <div class="bug-section">
        <div class="bug-section-header ${colorClass}">
          <span class="section-title">${severityLabel} Priority Bugs</span>
          <span class="section-count">${bugs.length} bug${bugs.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="bug-list">
          ${bugs.map((bug, idx) => `
            <div class="bug-item no-break">
              <div class="bug-number">${idx + 1}</div>
              <div class="bug-content">
                <div class="bug-title">${escapeHtml(bug.title || bug.description || 'Issue')}</div>
                <div class="bug-location">
                  ${bug.file_path ? `<span class="file-badge">${escapeHtml(bug.file_path)}</span>` : ''}
                  ${bug.line_number ? `<span class="line-info">Line ${bug.line_number}</span>` : ''}
                  ${bug.category ? `<span class="category-tag">${escapeHtml(bug.category)}</span>` : ''}
                </div>
                <div class="bug-details">${escapeHtml(bug.details || bug.description || 'No details available')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bug Report - ${escapeHtml(repoName)}</title>
  <style>
    /* ===== Print-Optimized Styles ===== */
    @page {
      size: A4;
      margin: 15mm 15mm 20mm 15mm;
    }
    
    @media print {
      html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
      .no-break { page-break-inside: avoid; }
    }
    
    /* ===== Base Styles ===== */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
    }
    
    .page {
      width: 100%;
      min-height: 100vh;
      padding: 0;
      background: white;
    }
    
    /* ===== Cover Page ===== */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      text-align: center;
      padding: 40px;
      background: linear-gradient(180deg, #fef2f2 0%, white 100%);
    }
    
    .cover-icon {
      font-size: 64pt;
      margin-bottom: 20px;
    }
    
    .cover-title {
      font-size: 32pt;
      font-weight: 700;
      color: #b91c1c;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 10px;
    }
    
    .cover-repo-name {
      font-size: 20pt;
      font-weight: 600;
      color: #374151;
      padding: 15px 40px;
      border: 3px solid #dc2626;
      border-radius: 8px;
      margin: 30px 0;
    }
    
    /* Stats Summary */
    .cover-stats {
      display: flex;
      gap: 20px;
      margin: 30px 0;
    }
    
    .cover-stat {
      padding: 20px 30px;
      border-radius: 8px;
      text-align: center;
    }
    
    .cover-stat.total { background: #eff6ff; border: 2px solid #3b82f6; }
    .cover-stat.critical { background: #fef2f2; border: 2px solid #dc2626; }
    .cover-stat.high { background: #fff7ed; border: 2px solid #ea580c; }
    .cover-stat.medium { background: #fefce8; border: 2px solid #ca8a04; }
    .cover-stat.low { background: #f0fdf4; border: 2px solid #16a34a; }
    
    .cover-stat-value {
      font-size: 28pt;
      font-weight: 700;
      line-height: 1;
    }
    
    .cover-stat.total .cover-stat-value { color: #1d4ed8; }
    .cover-stat.critical .cover-stat-value { color: #dc2626; }
    .cover-stat.high .cover-stat-value { color: #ea580c; }
    .cover-stat.medium .cover-stat-value { color: #ca8a04; }
    .cover-stat.low .cover-stat-value { color: #16a34a; }
    
    .cover-stat-label {
      font-size: 9pt;
      text-transform: uppercase;
      color: #64748b;
      margin-top: 5px;
    }
    
    .cover-date {
      margin-top: 40px;
      margin-bottom: 50px;
      font-size: 10pt;
      color: #94a3b8;
    }
    
    .cover-footer {
      margin-top: auto;
      padding-top: 30px;
      border-top: 1px solid #e2e8f0;
      font-size: 9pt;
      color: #94a3b8;
      width: 100%;
    }
    
    .cover-footer .footer-logo {
      font-size: 10pt;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 3px;
    }
    
    /* ===== Bug List Pages ===== */
    .bugs-page {
      padding: 40px;
    }
    
    .page-title {
      font-size: 18pt;
      font-weight: 700;
      color: #b91c1c;
      border-bottom: 3px solid #dc2626;
      padding-bottom: 10px;
      margin-bottom: 30px;
    }
    
    .bug-section {
      margin-bottom: 30px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    
    .bug-section-header {
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: white;
      font-weight: 600;
    }
    
    .bug-section-header.critical { background: linear-gradient(90deg, #b91c1c, #dc2626); }
    .bug-section-header.high { background: linear-gradient(90deg, #c2410c, #ea580c); }
    .bug-section-header.medium { background: linear-gradient(90deg, #a16207, #ca8a04); }
    .bug-section-header.low { background: linear-gradient(90deg, #15803d, #16a34a); }
    
    .section-title {
      font-size: 12pt;
    }
    
    .section-count {
      font-size: 10pt;
      opacity: 0.9;
    }
    
    .bug-list {
      padding: 15px;
    }
    
    .bug-item {
      display: flex;
      gap: 15px;
      padding: 15px;
      background: #f8fafc;
      border-radius: 6px;
      margin-bottom: 12px;
      border-left: 4px solid #e2e8f0;
    }
    
    .bug-item:last-child {
      margin-bottom: 0;
    }
    
    .bug-number {
      width: 28px;
      height: 28px;
      background: #dc2626;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      font-weight: 700;
      flex-shrink: 0;
    }
    
    .bug-content {
      flex: 1;
    }
    
    .bug-title {
      font-size: 11pt;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 8px;
    }
    
    .bug-location {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    
    .file-badge {
      font-family: 'Consolas', monospace;
      font-size: 9pt;
      background: #eff6ff;
      color: #1e40af;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    .line-info {
      font-size: 9pt;
      color: #64748b;
    }
    
    .category-tag {
      font-size: 8pt;
      background: #f3f4f6;
      color: #4b5563;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    
    .bug-details {
      font-size: 10pt;
      color: #374151;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 12px;
      font-family: 'Consolas', monospace;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
    }
    
    /* No Bugs */
    .no-bugs {
      text-align: center;
      padding: 60px;
      background: #f0fdf4;
      border: 2px solid #86efac;
      border-radius: 12px;
    }
    
    .no-bugs-icon {
      font-size: 48pt;
      margin-bottom: 15px;
    }
    
    .no-bugs-text {
      font-size: 14pt;
      color: #16a34a;
      font-weight: 600;
    }
    
    /* Page Footer */
    .page-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 8pt;
      color: #94a3b8;
    }
    
    .page-footer .footer-logo {
      font-size: 10pt;
      font-weight: 700;
      color: #dc2626;
      margin-bottom: 5px;
    }
  </style>
</head>
<body>
  <!-- ===== PAGE 1: Cover Page ===== -->
  <div class="page cover-page">
    <div class="cover-icon">🐛</div>
    <div class="cover-title">Bug Report</div>
    
    <div class="cover-repo-name">${escapeHtml(repoName)}</div>
    
    <div class="cover-stats">
      <div class="cover-stat total">
        <div class="cover-stat-value">${reports.length}</div>
        <div class="cover-stat-label">Total Bugs</div>
      </div>
      <div class="cover-stat critical">
        <div class="cover-stat-value">${criticalCount}</div>
        <div class="cover-stat-label">Critical</div>
      </div>
      <div class="cover-stat high">
        <div class="cover-stat-value">${highCount}</div>
        <div class="cover-stat-label">High</div>
      </div>
      <div class="cover-stat medium">
        <div class="cover-stat-value">${mediumCount}</div>
        <div class="cover-stat-label">Medium</div>
      </div>
      <div class="cover-stat low">
        <div class="cover-stat-value">${lowCount}</div>
        <div class="cover-stat-label">Low</div>
      </div>
    </div>
    
    <div class="cover-date">
      <div>Generated on ${dateStr}</div>
      <div>${timestamp}</div>
    </div>
    
    <div class="cover-footer">
      <div class="footer-logo">⚡ RepoIQ Bug Report</div>
      Address critical and high priority bugs first
    </div>
  </div>

  <!-- ===== PAGE 2+: Bug Details ===== -->
  <div class="page bugs-page">
    <div class="page-title">🔍 Bug Details</div>
    
    ${reports.length === 0 ? `
      <div class="no-bugs">
        <div class="no-bugs-icon">✅</div>
        <div class="no-bugs-text">No bugs found! Great job!</div>
      </div>
    ` : `
      ${generateBugList(criticalBugs, '🔴 Critical', 'critical')}
      ${generateBugList(highBugs, '🟠 High', 'high')}
      ${generateBugList(mediumBugs, '🟡 Medium', 'medium')}
      ${generateBugList(lowBugs, '🟢 Low', 'low')}
    `}
    
    <div class="page-footer">
      <div class="footer-logo">⚡ RepoIQ Bug Report</div>
      Generated ${dateStr} | ${reports.length} bugs found
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
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
