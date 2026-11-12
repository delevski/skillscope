import { parseFrontmatter, truncate } from "../frontmatter";
import type { RuleContext } from "../types";

const KNOWN_KEYS = new Set([
  "name", "description", "license", "allowed-tools", "metadata", "compatibility",
  "version", "model", "tools", "argument-hint", "disable-model-invocation", "user-invocable",
]);

export function frontmatterRules(ctx: RuleContext): void {
  if (ctx.kind !== "skill") return;
  const fm = parseFrontmatter(ctx.lines);
  const add = ctx.add;

  if (!fm.present) {
    add({
      ruleId: "fm-missing", severity: "high", category: "frontmatter", line: 1,
      title: "No frontmatter block",
      message: "Skills need a YAML frontmatter block with at least name and description, or agents will not discover them.",
      fix: {
        title: "Insert a starter frontmatter block", safe: true,
        description: "Adds name and description placeholders derived from the folder name.",
        edits: [{ line: 1, op: "insertBefore", text: `---\nname: ${guessName(ctx.file.path)}\ndescription: TODO describe what this skill does and when an agent should use it.\n---` }],
      },
    });
    return;
  }
  if (!fm.closed) {
    add({
      ruleId: "fm-unclosed", severity: "critical", category: "frontmatter", line: fm.startLine,
      title: "Frontmatter is never closed",
      message: "The opening --- has no matching closing ---, so the whole file may be read as metadata.",
      fix: {
        title: "Close the frontmatter block", safe: false,
        description: "Inserts a closing --- after the last key line. Review the position.",
        edits: [{ line: lastKeyLine(fm) + 1, op: "insertBefore", text: "---" }],
      },
    });
  }
  for (const p of fm.problems) {
    add({ ruleId: "fm-yaml", severity: "medium", category: "frontmatter", line: p.line, title: "Invalid YAML in frontmatter", message: p.message, snippet: ctx.lines[p.line - 1] });
  }
  const name = fm.data["name"];
  const desc = fm.data["description"];

  if (name === undefined || (typeof name === "string" && name.trim() === "")) {
    add({
      ruleId: "fm-name-missing", severity: "high", category: "frontmatter", line: fm.startLine,
      title: "Missing name", message: "The name field is required and identifies the skill.",
      fix: { title: "Add a name from the folder", safe: true, description: "Uses the parent folder name in kebab-case.", edits: [{ line: fm.startLine + 1, op: "insertBefore", text: `name: ${guessName(ctx.file.path)}` }] },
    });
  } else if (typeof name === "string") {
    const line = fm.keyLines["name"];
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      add({
        ruleId: "fm-name-format", severity: "medium", category: "frontmatter", line,
        title: "Name is not lowercase kebab-case",
        message: `"${name}" should use lowercase letters, digits and single hyphens.`,
        snippet: ctx.lines[line - 1],
        fix: { title: "Rewrite name as kebab-case", safe: true, description: `Becomes "${kebab(name)}".`, edits: [{ line, op: "replace", text: `name: ${kebab(name)}` }] },
      });
    }
    if (name.length > 64) {
      add({ ruleId: "fm-name-length", severity: "low", category: "frontmatter", line, title: "Name is longer than 64 characters", message: `The name is ${name.length} characters long.`, snippet: ctx.lines[line - 1] });
    }
    const folder = folderName(ctx.file.path);
    if (folder && folder !== "." && kebab(name) === name && name !== folder && /SKILL\.md$/i.test(ctx.file.path)) {
      add({
        ruleId: "fm-name-folder", severity: "low", category: "frontmatter", line,
        title: "Name does not match the folder",
        message: `Frontmatter says "${name}" but the folder is "${folder}".`,
        snippet: ctx.lines[line - 1],
        fix: { title: "Match the folder name", safe: false, description: `Sets name to "${folder}".`, edits: [{ line, op: "replace", text: `name: ${folder}` }] },
      });
    }
  }

  if (desc === undefined || (typeof desc === "string" && desc.trim() === "")) {
    add({
      ruleId: "fm-desc-missing", severity: "high", category: "frontmatter", line: fm.startLine,
      title: "Missing description", message: "Agents decide when to load a skill from its description. Without it the skill is never triggered.",
      fix: { title: "Add a description placeholder", safe: false, description: "Adds a TODO description you must fill in.", edits: [{ line: (fm.keyLines["name"] ?? fm.startLine) + 1, op: "insertBefore", text: "description: TODO describe what this skill does and when an agent should use it." }] },
    });
  } else if (typeof desc === "string") {
    const line = fm.keyLines["description"];
    if (desc.length < 30) {
      add({ ruleId: "fm-desc-short", severity: "medium", category: "frontmatter", line, title: "Description is too short to trigger reliably", message: `Only ${desc.length} characters. Say what it does and when to use it.`, snippet: ctx.lines[line - 1] });
    }
    if (desc.length > 1024) {
      add({ ruleId: "fm-desc-long", severity: "medium", category: "frontmatter", line, title: "Description is longer than 1024 characters", message: `${desc.length} characters of description are loaded into every session.`, snippet: truncate(ctx.lines[line - 1], 100) });
    }
  }

  for (const key of Object.keys(fm.data)) {
    if (!KNOWN_KEYS.has(key)) {
      const line = fm.keyLines[key];
      add({
        ruleId: "fm-unknown-key", severity: "info", category: "frontmatter", line,
        title: `Unknown frontmatter key "${key}"`, message: "Most agents ignore unknown keys. Check the spelling or move it under metadata.",
        snippet: ctx.lines[line - 1],
      });
    }
  }
}

function lastKeyLine(fm: ReturnType<typeof parseFrontmatter>): number {
  const lines = Object.values(fm.keyLines);
  return lines.length ? Math.max(...lines) : fm.startLine;
}
function folderName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}
export function guessName(path: string): string {
  const f = folderName(path);
  return kebab(f && f !== "." ? f : "my-skill");
}
export function kebab(s: string): string {
  return s.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "my-skill";
}
