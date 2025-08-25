// githubTools.js
import { Octokit } from "octokit";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = "sunny647";
const repo = "agentic";

export const githubTools = {
  listBranches: {
    name: "listBranches",
    description: "List all branches in the GitHub repository",
    parameters: { type: "object", properties: {} },
    execute: async () => {
      const branches = await octokit.repos.listBranches({ owner, repo });
      return branches.data.map(b => b.name);
    }
  },

  createBranch: {
    name: "createBranch",
    description: "Create a new branch from main",
    parameters: {
      type: "object",
      properties: { branchName: { type: "string" } },
      required: ["branchName"]
    },
    execute: async ({ branchName }) => {
      const mainRef = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
      const newBranch = await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: mainRef.data.object.sha
      });
      return `Branch created: ${newBranch.data.ref}`;
    }
  },

  updateFile: {
    name: "updateFile",
    description: "Update a file without overwriting it, appending new content",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        newContent: { type: "string" },
        branch: { type: "string" }
      },
      required: ["path", "newContent", "branch"]
    },
    execute: async ({ path, newContent, branch }) => {
      const file = await octokit.repos.getContent({ owner, repo, path, ref: branch });
      const oldContent = Buffer.from(file.data.content, "base64").toString("utf8");
      const updatedContent = oldContent + "\n" + newContent;

      const commit = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `Update ${path}`,
        content: Buffer.from(updatedContent).toString("base64"),
        sha: file.data.sha,
        branch
      });

      return `File updated: ${commit.data.commit.html_url}`;
    }
  },

  createPR: {
    name: "createPR",
    description: "Create a pull request",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        head: { type: "string" },
        base: { type: "string" }
      },
      required: ["title", "head", "base"]
    },
    execute: async ({ title, body, head, base }) => {
      const pr = await octokit.pulls.create({ owner, repo, title, body, head, base });
      return `PR created: ${pr.data.html_url}`;
    }
  }
};
