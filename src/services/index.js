// index.js
import OpenAI from "openai";
import { MCPClient } from "./mcpclient.js";
dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const mcp = new MCPClient("ws://localhost:4000");
  await mcp.connect();

  // A) List branches (useful to pick base/head)
  const branches = await mcp.call("github.listBranches", {
    owner: "sunny647",
    repo: "agentic",
  });
  console.log("Branches:", branches.map(b => b.name));

  // B) List commits on a branch
  const commits = await mcp.call("github.listCommits", {
    owner: "sunny647",
    repo: "agentic",
    sha: "main",
    per_page: 10,
  });
  console.log("Recent commits on main:", commits.map(c => c.sha.substring(0,7)));

  // Create a new branch from main
const newBranch = await mcp.call("github.createBranch", {
  owner: "sunny647",
  repo: "agentic",
  newBranch: "feature/test-pr",
  baseBranch: "main",
});
console.log("🌱 New branch created:", newBranch.ref);

// C.1) Get README content from the branch (so we can update instead of overwrite)
  const readme = await mcp.call("github.getFile", {
    owner: "sunny647",
    repo: "agentic",
    path: "README.md",
    ref: "main",
  });
  console.log("📖 Current README size:", readme.content.length);

  const updatedReadme = readme.content + `\n\n### Update\nThis section was added via MCP at ${new Date().toISOString()}`;

  // D) Commit files (using updated README content)
  const commit = await mcp.call("github.commitFiles", {
    owner: "sunny647",
    repo: "agentic",
    branch: "feature/test-pr",
    message: "Update README and add docs via MCP",
    files: [
      {
        path: "README.md",
        content: updatedReadme,
      },
      {
        path: "docs/intro.md",
        content: "This file was created by MCP server at " + new Date().toISOString(),
      }
    ],
  });
  console.log("📦 New commit created:", commit.html_url);

// Now you can open a PR as before
const pr = await mcp.call("github.createPullRequest", {
  owner: "sunny647",
  repo: "agentic",
  title: "Docs and README update",
  head: "feature/test-pr",
  base: "main",
  body: "This PR was created end-to-end via MCP server (branch + commit + PR).",
});
console.log("✅ PR created:", pr.html_url);


  // D) Fetch commits & files in that PR
  const prCommits = await mcp.call("github.listPullRequestCommits", {
    owner: "sunny647",
    repo: "agentic",
    number: pr.number,
  });
  const prFiles = await mcp.call("github.listPullRequestFiles", {
    owner: "sunny647",
    repo: "agentic",
    number: pr.number,
  });

  // E) Get diff (base..head) for model review
  const diff = await mcp.call("github.getDiff", {
    owner: "sunny647",
    repo: "agentic",
    base: "main",
    head: "feature/telemetry",
  });

  // F) Hand PR summary to GPT
  const summary = {
    pr: { number: pr.number, title: pr.title, url: pr.html_url },
    commits: prCommits.map(c => ({ sha: c.sha, message: c.commit.message })),
    files: prFiles.map(f => ({ filename: f.filename, additions: f.additions, deletions: f.deletions, status: f.status })),
    diff: diff.slice(0, 6000), // keep prompt size sane; chunk if needed
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: "You are a senior code reviewer." },
      { role: "user", content: "Review this PR. Call out risks, test gaps, and perf/security issues." },
      { role: "assistant", content: JSON.stringify(summary) }
    ],
    temperature: 0.2,
  });

  console.log("\n=== GPT Review ===\n");
  console.log(completion.choices[0].message.content);
}

main().catch(console.error);
