// githubTools.js
import { Octokit } from "@octokit/rest";
import { applyPatch } from "diff";
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const getFileTool = {
  name: "getFile",
  description: "Get the latest content of a file from the repo.",
  args: {
    path: { type: "string", description: "Path to the file" },
    owner: { type: "string", description: "Repo owner" },
    repo: { type: "string", description: "Repo name" },
    ref: { type: "string", description: "Branch or ref", optional: true }
  },
  call: async function({ path, owner, repo, ref = "main" }) {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if ("content" in data) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    throw new Error("File not found or is a directory.");
  }
};
/**
 * Get file content from a branch
 */
export async function getFile({ owner, repo, path, ref = "main" }) {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });

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
  createBranch,
  commitFiles,
  createPR,
};
