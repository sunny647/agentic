// githubTools.js
import { Octokit } from "@octokit/rest";
import { applyPatch } from "diff";
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
import { z } from "zod";
import { tool } from "@langchain/core/tools";
// --- Setup repo/branch info ---

/**
 * Get file content from base branch
 */
export async function getFile({ path, ref }) {
  try {
    const baseBranch = ref || process.env.GIT_DEFAULT_BRANCH || "main";
    const repoOwner = process.env.GITHUB_REPO_OWNER;
    const repoName = process.env.GITHUB_REPO_NAME;

    const { data } = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path,
      ref: baseBranch,
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
}

/**
 * LangChain Tool: getFiles
 */
export const getFiles = tool(
  async ({ paths }) => {
    const results = {};
    for (const path of paths) {
      try {
        const file = await getFile({ path });
        results[path] = file.content;
      } catch (err) {
        results[path] = null;
      }
    }
    return results;
  },
  {
    name: "get_files",
    description: "Retrieve the latest content of multiple files from the GitHub repo.",
    schema: z.object({
      paths: z.array(z.string()).describe("List of file paths to retrieve"),
    }),
  }
);

/**
 * Create a new branch from base branch
 */
export async function createBranch({ owner, repo, newBranch, baseBranch }) {
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

/**
 * Commit file(s) to a branch. Supports {action: create|modify|delete, patch}.
 */
export async function commitFiles({ owner, repo, branch, message, files }) {
  // Validate files array is not empty
  if (!files || files.length === 0) {
    throw new Error('commitFiles: No files provided for commit. Skipping commit.');
  }

  // 1. Get latest commit ref
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
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
      const current = await getFile({ owner, repo, path: f.path, ref: branch });
      if (!current.content)
        throw new Error(`File ${f.path} does not exist for modification`);

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
    tree: blobs.map((b) => ({
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

/**
 * Create a pull request
 */
export async function createPR({ owner, repo, title, body, head, base }) {
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

// Export as a grouped object if you want convenience import
export const githubTools = {
  getFile,
  getFiles,
  createBranch,
  commitFiles,
  createPR,
};
