import { motion } from "framer-motion";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock file tree
const fileTree = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "api",
        type: "folder",
        children: [
          { name: "auth.ts", type: "file", issues: 2 },
          { name: "users.ts", type: "file", issues: 0 },
          { name: "data.ts", type: "file", issues: 1 },
        ],
      },
      {
        name: "components",
        type: "folder",
        children: [
          { name: "Form.tsx", type: "file", issues: 1 },
          { name: "Button.tsx", type: "file", issues: 0 },
          { name: "Modal.tsx", type: "file", issues: 0 },
        ],
      },
      {
        name: "hooks",
        type: "folder",
        children: [
          { name: "useAuth.ts", type: "file", issues: 1 },
          { name: "useData.ts", type: "file", issues: 0 },
        ],
      },
      {
        name: "utils",
        type: "folder",
        children: [
          { name: "helpers.ts", type: "file", issues: 1 },
          { name: "constants.ts", type: "file", issues: 0 },
        ],
      },
    ],
  },
  { name: "package.json", type: "file", issues: 0 },
  { name: "tsconfig.json", type: "file", issues: 0 },
  { name: "README.md", type: "file", issues: 0 },
];

// Mock file content
const mockFileContent = `import { db } from '../db';
import { User } from '../types';

export async function authenticateUser(
  email: string, 
  password: string
): Promise<User | null> {
  // TODO: Add rate limiting
  
  // WARNING: Potential SQL injection vulnerability
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  
  const result = await db.query(query);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const user = result.rows[0];
  
  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  
  if (!isValid) {
    // WARNING: Logging sensitive data
    console.log("Failed login attempt:", { email, password });
    return null;
  }
  
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

export async function getUserById(userId: string): Promise<User | null> {
  const query = "SELECT * FROM users WHERE id = $1";
  const result = await db.query(query, [userId]);
  
  return result.rows[0] || null;
}`;

const codeAnalysis = [
  {
    line: 11,
    type: "error",
    message: "SQL Injection vulnerability: User input directly in query",
  },
  {
    line: 27,
    type: "warning",
    message: "Sensitive data (password) being logged",
  },
  {
    line: 1,
    type: "info",
    message: 'Consider adding "use strict" directive',
  },
  {
    line: 8,
    type: "info",
    message: "Missing JSDoc documentation for function",
  },
];

interface FileTreeItemProps {
  item: any;
  depth?: number;
  onSelect: (name: string) => void;
  selectedFile: string | null;
}

function FileTreeItem({
  item,
  depth = 0,
  onSelect,
  selectedFile,
}: FileTreeItemProps) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const isFolder = item.type === "folder";
  const isSelected = selectedFile === item.name;

  return (
    <div>
      <div
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(item.name);
          }
        }}
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isOpen ? (
              <FolderOpen className="h-4 w-4 text-primary" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File className="h-4 w-4" />
          </>
        )}
        <span className="text-sm flex-1">{item.name}</span>
        {!isFolder && item.issues > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
            {item.issues}
          </span>
        )}
      </div>
      {isFolder && isOpen && item.children && (
        <div>
          {item.children.map((child: any, index: number) => (
            <FileTreeItem
              key={index}
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Files() {
  const [selectedFile, setSelectedFile] = useState<string | null>("auth.ts");

  const lines = mockFileContent.split("\n");

  return (
    <DashboardLayout>
      <div className="flex gap-6 h-[calc(100vh-8rem)]">
        {/* File tree */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-64 glass-panel rounded-xl overflow-hidden flex flex-col"
        >
          <div className="p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Files</h3>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {fileTree.map((item, index) => (
              <FileTreeItem
                key={index}
                item={item}
                onSelect={setSelectedFile}
                selectedFile={selectedFile}
              />
            ))}
          </div>
        </motion.div>

        {/* Code viewer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <File className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">src/api/{selectedFile}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {lines.length} lines
              </span>
            </div>
          </div>

          {/* Code */}
          <div className="flex-1 overflow-auto">
            <pre className="text-sm font-mono">
              {lines.map((line, index) => {
                const lineNumber = index + 1;
                const analysis = codeAnalysis.find(
                  (a) => a.line === lineNumber
                );
                return (
                  <div
                    key={index}
                    className={cn(
                      "flex group hover:bg-muted/30 transition-colors",
                      analysis?.type === "error" && "bg-destructive/5",
                      analysis?.type === "warning" && "bg-warning/5"
                    )}
                  >
                    {/* Line number */}
                    <span className="w-12 text-right pr-4 text-muted-foreground select-none py-0.5 border-r border-border">
                      {lineNumber}
                    </span>
                    {/* Issue indicator */}
                    <span className="w-8 flex items-center justify-center">
                      {analysis?.type === "error" && (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      )}
                      {analysis?.type === "warning" && (
                        <AlertTriangle className="h-3 w-3 text-warning" />
                      )}
                      {analysis?.type === "info" && (
                        <Info className="h-3 w-3 text-primary" />
                      )}
                    </span>
                    {/* Code */}
                    <code className="flex-1 py-0.5 pl-2">{line || " "}</code>
                  </div>
                );
              })}
            </pre>
          </div>
        </motion.div>

        {/* Analysis panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="w-80 glass-panel rounded-xl overflow-hidden flex flex-col"
        >
          <div className="p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Analysis</h3>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {codeAnalysis.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg",
                  item.type === "error" && "bg-destructive/10",
                  item.type === "warning" && "bg-warning/10",
                  item.type === "info" && "bg-primary/10"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {item.type === "error" && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                  {item.type === "warning" && (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                  {item.type === "info" && (
                    <Info className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    Line {item.line}
                  </span>
                </div>
                <p className="text-sm">{item.message}</p>
              </div>
            ))}

            {/* Suggestions */}
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium mb-3">AI Suggestions</h4>
              <div className="space-y-2">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Use parameterized queries to prevent SQL injection.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2 gap-1">
                    Apply fix
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Add JSDoc comments for better documentation.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2 gap-1">
                    Generate docs
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
