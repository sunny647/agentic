// githubTools.js
import { Octokit } from "@octokit/rest";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { applyPatch } from "diff";


const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// const owner = "sunny647";
// const repo = "agentic";

// --- Tool: get file ---
export const getFileTool = tool({
  name: "getFile",
  description: "Retrieve the contents of a file from a branch",
  schema: z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    ref: z.string().default("main"),
  }),
  async func({ owner, repo, path, ref }) {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ("content" in data) {
        return {
          path: data.path,
          encoding: data.encoding,
          content: Buffer.from(data.content, "base64").toString("utf-8"),
        };
      } else {
        throw new Error("The path points to a directory, not a file.");
      }
    } catch (err) {
      if (err.status === 404) {
        return { path, content: null }; // file doesn’t exist (new file case)
      }
      throw err;
    }
  },
});


// --- Tool: create branch ---
export const createBranchTool = tool({
  name: "createBranch",
  description: "Create a new branch from base branch",
  schema: z.object({
    owner: z.string(),
    repo: z.string(),
    newBranch: z.string(),
    baseBranch: z.string()
  }),
  async func({ owner, repo, newBranch, baseBranch }) {
    const { data: baseRef } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });
    const sha = baseRef.object.sha;

    const { data } = await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranch}`,
      sha,
    });

    return data;
  }
});

// --- Tool: commit file changes (with patch support) ---
export const commitFilesTool = tool({
  name: "commitFiles",
  description: "Commit file(s) to a branch. Supports {action: create|modify|delete, patch}.",
  schema: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    message: z.string(),
    files: z.array(z.object({
      path: z.string(),
      action: z.enum(["create", "modify", "delete"]).default("modify"),
      content: z.string().optional(),
      patch: z.string().optional(),
    }))
  }),
  async func({ owner, repo, branch, message, files }) {
    // 1. Get latest commit ref
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const latestCommitSha = ref.object.sha;

    const { data: commit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });

    const blobs = [];

    for (const f of files) {
      let finalContent = f.content;

      if (f.action === "modify" && f.patch) {
        // Fetch current file
        const current = await getFileTool.func({ owner, repo, path: f.path, ref: branch });
        if (!current.content) throw new Error(`File ${f.path} does not exist for modification`);
        // Apply patch
        finalContent = applyPatch(current.content, f.patch);
        if (!finalContent) throw new Error(`Patch failed for ${f.path}`);
      }

      if (f.action === "delete") {
        // Delete = don’t add blob
        continue;
      }

      // Create blob
      const blob = await octokit.git.createBlob({
        owner,
        repo,
        content: finalContent || "",
        encoding: "utf-8",
      });
      blobs.push({ path: f.path, sha: blob.data.sha });
    }

    // 2. Create new tree
    const { data: tree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: commit.tree.sha,
      tree: blobs.map(b => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    });

    // 3. Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: [latestCommitSha],
    });

    // 4. Update branch ref
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
      force: true,
    });

    return { sha: newCommit.sha, message: newCommit.message };
  }
});


// --- Tool: create PR ---
export const createPRTool = tool({
  name: "createPullRequest",
  description: "Open a PR from head branch into base branch",
  schema: z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string(),
    head: z.string(),
    base: z.string()
  }),
  async func({ owner, repo, title, body, head, base }) {
    const { data } = await octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    return { url: data.html_url, number: data.number };
  }
});

export const githubTools = [
  createBranchTool,
  getFileTool,
  commitFilesTool,
  createPRTool
];