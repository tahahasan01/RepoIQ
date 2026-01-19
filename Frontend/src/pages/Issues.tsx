import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  Search,
  Filter,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
  X,
} from "lucide-react";
import { scanStorage, ScanIssue } from "@/services/scanService";

const severityOrder = ["critical", "high", "medium", "low"];
const severityColors: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

export default function Issues() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [copiedFix, setCopiedFix] = useState(false);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  // owner-only app: no role checks

  useEffect(() => {
    // Load latest scan on mount
    const latestScan = scanStorage.getLatestScan();
    if (latestScan) {
      setIssues(latestScan.issues);
    }

    // Listen for new scans
    const handleScanCompleted = (event: CustomEvent) => {
      setIssues(event.detail.issues);
    };

    window.addEventListener("scanCompleted", handleScanCompleted as EventListener);
    return () => {
      window.removeEventListener("scanCompleted", handleScanCompleted as EventListener);
    };
  }, []);

  const severityOptions = ["critical", "high", "medium", "low"];
  const typeOptions = Array.from(new Set(issues.map((i) => i.type))).sort();

  const filteredIssues = issues.filter((issue) => {
    const matchesQuery =
      issue.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity = selectedSeverities.length === 0
      ? true
      : selectedSeverities.includes(issue.severity);

    const matchesType = selectedTypes.length === 0
      ? true
      : selectedTypes.includes(issue.type);

    return matchesQuery && matchesSeverity && matchesType;
  });

  const selectedIssueData = issues.find(
    (issue) => issue.id === selectedIssue
  );

  const handleCopyFix = () => {
    if (selectedIssueData) {
      navigator.clipboard.writeText(selectedIssueData.fix);
      setCopiedFix(true);
      setTimeout(() => setCopiedFix(false), 2000);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex gap-6 h-[calc(100vh-8rem)]">
        {/* Issues list */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex-1 flex flex-col glass-panel rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-xl font-semibold">Issues</h2>
              <span className="text-sm text-muted-foreground">
                {filteredIssues.length} found
              </span>
              
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <MultiSelectFilter
                  label="Severity"
                  options={severityOptions}
                  selected={selectedSeverities}
                  onChange={setSelectedSeverities}
                />

                <MultiSelectFilter
                  label="Type"
                  options={typeOptions}
                  selected={selectedTypes}
                  onChange={setSelectedTypes}
                />

                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filter
                </Button>
              </div>
            </div>
          </div>

          {/* Issues table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card/90 backdrop-blur">
                <tr className="border-b border-border text-left">
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    File
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Line
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Severity
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="p-3 text-sm font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue, index) => (
                  <motion.tr
                    key={issue.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => setSelectedIssue(issue.id)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      selectedIssue === issue.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td className="p-3">
                      <code className="text-sm font-mono">{issue.file}</code>
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {issue.line}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full border ${severityColors[issue.severity]}`}
                      >
                        {issue.severity}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                        {issue.type}
                      </span>
                    </td>
                    <td className="p-3 text-sm">{issue.description}</td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-primary"
                      >
                        <Sparkles className="h-3 w-3" />
                          Suggestions
                      </Button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

          {/* Suggestions panel */}
        {selectedIssueData && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-96 glass-panel rounded-xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Suggestions</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedIssue(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Issue info */}
              <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      selectedIssueData.severity === "critical"
                        ? "text-destructive"
                        : selectedIssueData.severity === "high"
                        ? "text-orange-500"
                        : selectedIssueData.severity === "medium"
                        ? "text-warning"
                        : "text-success"
                    }`}
                  />
                  <span className="text-sm font-medium">
                    {selectedIssueData.description}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedIssueData.details}
                </p>
              </div>

              {/* Code fix */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Suggested Fix</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={handleCopyFix}
                  >
                    {copiedFix ? (
                      <>
                        <Check className="h-3 w-3 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <pre className="p-4 bg-foreground/5 rounded-lg overflow-x-auto text-sm font-mono">
                  <code>{selectedIssueData.fix}</code>
                </pre>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border">
              <Button variant="outline" className="w-full">
                Ignore
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
