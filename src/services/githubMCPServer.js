// githubMCPServer.js
import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";
dotenv.config();
const GITHUB_API = "https://api.github.com";
const PORT = 4000;
const GITHUB_TOKEN =  process.env.GITHUB_TOKEN; // Ensure it's a string

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var");
  process.exit(1);
}

function baseHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "mcp-github-server",
    ...extra,
  };
}

async function ghGet(path, params = {}, acceptHeader) {
  const url = new URL(`${GITHUB_API}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url, { headers: baseHeaders(acceptHeader ? { Accept: acceptHeader } : {}) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} -> ${res.status}: ${text}`);
  }
  // If diff requested, return text
  if (acceptHeader && acceptHeader.includes("diff")) return res.text();
  return res.json();
}

async function ghPost(path, body) {
  const url = `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} -> ${res.status}: ${text}`);
  }
  return res.json();
}

/* ---------- Existing minimal methods ---------- */
async function listRepos({ user, per_page = 50, page = 1 }) {
  return ghGet(`/users/${user}/repos`, { per_page, page });
}
async function getRepo({ owner, repo }) {
  return ghGet(`/repos/${owner}/${repo}`);
}
async function createIssue({ owner, repo, title, body }) {
  return ghPost(`/repos/${owner}/${repo}/issues`, { title, body });
}

/* ---------- NEW: Commits & PRs ---------- */
// List repo commits (optionally by branch, since/until)
async function listCommits({ owner, repo, sha, since, until, per_page = 50, page = 1 }) {
  return ghGet(`/repos/${owner}/${repo}/commits`, { sha, since, until, per_page, page });
}

// Get a single commit (ref can be sha or branch)
async function getCommit({ owner, repo, ref }) {
  return ghGet(`/repos/${owner}/${repo}/commits/${ref}`);
}

// Create a pull request
// head: "feature-branch" OR "owner:branch" if cross-fork; base: "main"
async function createPullRequest({ owner, repo, title, head, base, body, draft = false }) {
  return ghPost(`/repos/${owner}/${repo}/pulls`, { title, head, base, body, draft });
}

// List commits attached to a PR
async function listPullRequestCommits({ owner, repo, number, per_page = 100, page = 1 }) {
  return ghGet(`/repos/${owner}/${repo}/pulls/${number}/commits`, { per_page, page });
}

// List files changed in a PR
async function listPullRequestFiles({ owner, repo, number, per_page = 100, page = 1 }) {
  return ghGet(`/repos/${owner}/${repo}/pulls/${number}/files`, { per_page, page });
}

// Get a raw diff between two refs (base..head)
async function getDiff({ owner, repo, base, head }) {
  // NOTE: Accept header requests diff
  return ghGet(`/repos/${owner}/${repo}/compare/${base}...${head}`, {}, "application/vnd.github.v3.diff");
}

// (Optional) list branches, useful for UX
async function listBranches({ owner, repo, per_page = 100, page = 1 }) {
  return ghGet(`/repos/${owner}/${repo}/branches`, { per_page, page });
}

// (Optional) rate limit info for diagnostics
async function getRateLimit() {
  return ghGet(`/rate_limit`);
}

// Get a branch reference (commit SHA)
async function getBranchRef({ owner, repo, branch }) {
  return ghGet(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
}

// Create a new branch from base branch
async function createBranch({ owner, repo, newBranch, baseBranch }) {
  // 1. Get commit SHA of base branch
  const baseRef = await getBranchRef({ owner, repo, branch: baseBranch });
  const sha = baseRef.object.sha;

  // 2. Create new branch ref
  const body = {
    ref: `refs/heads/${newBranch}`,
    sha,
  };

  return ghPost(`/repos/${owner}/${repo}/git/refs`, body);
}

// Create a blob (file content)
async function createBlob({ owner, repo, content, encoding = "utf-8" }) {
  return ghPost(`/repos/${owner}/${repo}/git/blobs`, { content, encoding });
}

// Get base tree SHA from a branch
async function getTree({ owner, repo, sha, recursive = false }) {
  return ghGet(`/repos/${owner}/${repo}/git/trees/${sha}`, { recursive: recursive ? 1 : undefined });
}

// Create a new tree
async function createTree({ owner, repo, baseTree, files }) {
  // files: [{ path, content, mode }]
  const tree = files.map(f => ({
    path: f.path,
    mode: f.mode || "100644", // normal file
    type: "blob",
    content: f.content,
  }));

  return ghPost(`/repos/${owner}/${repo}/git/trees`, {
    base_tree: baseTree,
    tree,
  });
}

// Create a commit
async function createCommit({ owner, repo, message, tree, parents }) {
  return ghPost(`/repos/${owner}/${repo}/git/commits`, {
    message,
    tree,
    parents,
  });
}

// Update branch ref (move it to new commit)
async function updateRef({ owner, repo, branch, sha, force = false }) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...baseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ sha, force }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${url} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// High-level convenience: commit files to a branch
async function commitFiles({ owner, repo, branch, message, files }) {
  // 1. Get branch ref (commit SHA)
  const ref = await getBranchRef({ owner, repo, branch });
  const parentSha = ref.object.sha;

  // 2. Get tree of that commit
  const commitData = await ghGet(`/repos/${owner}/${repo}/commits/${parentSha}`);
  const baseTree = commitData.commit.tree.sha;

  // 3. Create new tree with files
  const newTree = await createTree({ owner, repo, baseTree, files });

  // 4. Create commit
  const commit = await createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [parentSha],
  });

  // 5. Move branch ref
  await updateRef({ owner, repo, branch, sha: commit.sha });

  return commit;
}


// Get a single file's content from a repo
async function getFile({ owner, repo, path, ref = "main" }) {
  // GitHub API endpoint for file contents
  const data = await ghGet(`/repos/${owner}/${repo}/contents/${path}`, { ref });
  
  // If the path is a directory, throw
  if (Array.isArray(data)) {
    throw new Error("Path points to a directory, not a file");
  }

  // Decode base64 content
  const content = Buffer.from(data.content, data.encoding || "base64").toString("utf-8");

  return {
    path: data.path,
    sha: data.sha,
    encoding: data.encoding,
    content,
  };
}


/* ---------- MCP Method Map ---------- */
const methods = {
  // Existing
  "github.listRepos": listRepos,
  "github.getRepo": getRepo,
  "github.createIssue": createIssue,

  // New
  "github.listCommits": listCommits,
  "github.getCommit": getCommit,
  "github.createPullRequest": createPullRequest,
  "github.listPullRequestCommits": listPullRequestCommits,
  "github.listPullRequestFiles": listPullRequestFiles,
  "github.getDiff": getDiff,
  "github.listBranches": listBranches,
  "github.getRateLimit": getRateLimit,

  // New
  "github.createBranch": createBranch,
  "github.getBranchRef": getBranchRef,

  // New file/commit ops
  "github.createBlob": createBlob,
  "github.getTree": getTree,
  "github.createTree": createTree,
  "github.createCommit": createCommit,
  "github.updateRef": updateRef,
  "github.commitFiles": commitFiles,
  "github.getFile": getFile,
};

/* ---------- WebSocket JSON-RPC ---------- */
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 GitHub MCP Server running at ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  console.log("✅ Client connected to MCP Server");

  ws.on("message", async (message) => {
    let req;
    try { req = JSON.parse(message.toString()); }
    catch (e) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" }}));
      return;
    }

    const { id, method, params } = req;
    if (!method || !(method in methods)) {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method ${method} not found` },
      }));
      return;
    }

    try {
      const result = await methods[method](params || {});
      // If diff text, it’s a string; else JSON
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (err) {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err?.message || String(err) },
      }));
    }
  });
});
