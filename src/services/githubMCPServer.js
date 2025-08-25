// githubMCPServer.js
import WebSocket, { WebSocketServer } from "ws";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const PORT = 4000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("❌ Missing GITHUB_TOKEN env var");
  process.exit(1);
}

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
  userAgent: "mcp-github-server"
});

/* ---------- GitHub Tools via Octokit ---------- */

// List repositories for a user
async function listRepos({ user, per_page = 50, page = 1 }) {
  const res = await octokit.repos.listForUser({ username: user, per_page, page });
  return res.data;
}

// Get repository details
async function getRepo({ owner, repo }) {
  const res = await octokit.repos.get({ owner, repo });
  return res.data;
}

// Create issue
async function createIssue({ owner, repo, title, body }) {
  const res = await octokit.issues.create({ owner, repo, title, body });
  return res.data;
}

// List commits
async function listCommits({ owner, repo, sha, since, until, per_page = 50, page = 1 }) {
  const res = await octokit.repos.listCommits({ owner, repo, sha, since, until, per_page, page });
  return res.data;
}

// Get commit
async function getCommit({ owner, repo, ref }) {
  const res = await octokit.repos.getCommit({ owner, repo, ref });
  return res.data;
}

// Create pull request
async function createPullRequest({ owner, repo, title, head, base, body, draft = false }) {
  const res = await octokit.pulls.create({ owner, repo, title, head, base, body, draft });
  return res.data;
}

// List commits on a PR
async function listPullRequestCommits({ owner, repo, number, per_page = 100, page = 1 }) {
  const res = await octokit.pulls.listCommits({ owner, repo, pull_number: number, per_page, page });
  return res.data;
}

// List files in a PR
async function listPullRequestFiles({ owner, repo, number, per_page = 100, page = 1 }) {
  const res = await octokit.pulls.listFiles({ owner, repo, pull_number: number, per_page, page });
  return res.data;
}

// Get compare diff (base..head)
async function getDiff({ owner, repo, base, head }) {
  const res = await octokit.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${base}...${head}`,
    headers: { accept: "application/vnd.github.v3.diff" }
  });
  return res.data;
}

// List branches
async function listBranches({ owner, repo, per_page = 100, page = 1 }) {
  const res = await octokit.repos.listBranches({ owner, repo, per_page, page });
  return res.data;
}

// Rate limit info
async function getRateLimit() {
  const res = await octokit.rateLimit.get();
  return res.data;
}

// Get branch reference
async function getBranchRef({ owner, repo, branch }) {
  const res = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  return res.data;
}

// Create branch
async function createBranch({ owner, repo, newBranch, baseBranch }) {
  const baseRef = await getBranchRef({ owner, repo, branch: baseBranch });
  const sha = baseRef.object.sha;

  const res = await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
    sha
  });
  return res.data;
}

// Commit files (createOrUpdateFileContents)
async function commitFiles({ owner, repo, branch, message, files }) {
  const results = [];
  for (const f of files) {
    // Get old file SHA if exists
    let sha;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path: f.path, ref: branch });
      if (!Array.isArray(existing.data)) sha = existing.data.sha;
    } catch {
      sha = undefined; // new file
    }

    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: f.path,
      message,
      branch,
      content: Buffer.from(f.content).toString("base64"),
      sha
    });

    results.push(res.data);
  }
  return results;
}

// Get file content
async function getFile({ owner, repo, path, ref = "main" }) {
  const res = await octokit.repos.getContent({ owner, repo, path, ref });
  if (Array.isArray(res.data)) throw new Error("Path points to a directory, not a file");

  return {
    path: res.data.path,
    sha: res.data.sha,
    encoding: res.data.encoding,
    content: Buffer.from(res.data.content, res.data.encoding).toString("utf-8")
  };
}

/* ---------- MCP Method Map ---------- */
const methods = {
  "github.listRepos": listRepos,
  "github.getRepo": getRepo,
  "github.createIssue": createIssue,
  "github.listCommits": listCommits,
  "github.getCommit": getCommit,
  "github.createPullRequest": createPullRequest,
  "github.listPullRequestCommits": listPullRequestCommits,
  "github.listPullRequestFiles": listPullRequestFiles,
  "github.getDiff": getDiff,
  "github.listBranches": listBranches,
  "github.getRateLimit": getRateLimit,
  "github.createBranch": createBranch,
  "github.getBranchRef": getBranchRef,
  "github.commitFiles": commitFiles,
  "github.getFile": getFile
};

/* ---------- WebSocket JSON-RPC ---------- */
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 GitHub MCP Server running at ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  console.log("✅ Client connected to MCP Server");

  ws.on("message", async (message) => {
    let req;
    try {
      req = JSON.parse(message.toString());
    } catch (e) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }

    const { id, method, params } = req;
    if (!method || !(method in methods)) {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method ${method} not found` }
      }));
      return;
    }

    try {
      const result = await methods[method](params || {});
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch (err) {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err?.message || String(err) }
      }));
    }
  });
});
