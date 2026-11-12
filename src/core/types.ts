export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Category = "security" | "frontmatter" | "context" | "config";
export type FileKind = "skill" | "mcp" | "plugin" | "agent-md" | "unknown";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
export const CATEGORIES: Category[] = ["security", "frontmatter", "context", "config"];

export interface Edit {
  /** 1-based line number the edit targets */
  line: number;
  op: "replace" | "delete" | "insertBefore";
  text?: string;
}

export interface Fix {
  title: string;
  description: string;
  edits: Edit[];
  /** safe fixes can be applied automatically with --fix */
  safe: boolean;
}

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  file: string;
  line?: number;
  snippet?: string;
  fix?: Fix;
}

export interface InputFile {
  path: string;
  content: string;
}

export interface FileReport {
  path: string;
  kind: FileKind;
  tokens: number;
  lines: number;
  score: number;
  findings: Finding[];
}

export interface Report {
  files: FileReport[];
  findings: Finding[];
  score: number;
  grade: string;
  categoryScores: Record<Category, number>;
  bySeverity: Record<Severity, number>;
  byCategory: Record<Category, number>;
  tokens: number;
  generatedAt: string;
}

export interface RuleContext {
  file: InputFile;
  kind: FileKind;
  lines: string[];
  add: (f: Omit<Finding, "id" | "file" | "ruleId"> & { ruleId?: string }) => void;
}
