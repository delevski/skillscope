import type { InputFile } from "@core/index";

const MATCH = /(^|\/)(skill\.md|claude\.md|agents\.md|\.cursorrules|\.?mcp\.json|claude_desktop_config\.json|plugin\.json|marketplace\.json)$/i;

export function parseRepo(input: string): { owner: string; repo: string; ref?: string } {
  const m = /(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/\s]+))?\/?$/i.exec(input.trim().replace(/^https?:\/\//, "").replace(/^www\./, ""));
  if (!m) throw new Error("Enter a repo like owner/name or https://github.com/owner/name");
  return { owner: m[1], repo: m[2], ref: m[3] };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) throw new Error("Repository not found. It may be private or misspelled.");
  if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit reached for anonymous requests. Wait a minute and retry.");
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

export async function fetchRepoFiles(input: string, limit = 30): Promise<InputFile[]> {
  const { owner, repo, ref } = parseRepo(input);
  const meta = await getJson(`https://api.github.com/repos/${owner}/${repo}`);
  const branch = ref ?? meta.default_branch;
  const tree = await getJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const paths: string[] = (tree.tree ?? []).filter((n: any) => n.type === "blob" && MATCH.test(n.path) && !/node_modules\//.test(n.path)).map((n: any) => n.path).slice(0, limit);
  if (!paths.length) throw new Error("No SKILL.md, CLAUDE.md, MCP or plugin files found in that repo.");
  const out: InputFile[] = [];
  for (let i = 0; i < paths.length; i += 6) {
    const batch = paths.slice(i, i + 6);
    const got = await Promise.all(batch.map(async (p) => {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${p.split("/").map(encodeURIComponent).join("/")}`);
      if (!r.ok) throw new Error(`Could not download ${p} (${r.status})`);
      return { path: p, content: await r.text() };
    }));
    out.push(...got);
  }
  return out;
}
