// clientExample.js
import { MCPClient } from "./mcpClient.js";

async function run() {
  const client = new MCPClient("ws://localhost:8080");
  await client.connect();

  // 1. Create a branch
  const branch = await client.call("github.createBranch", { branchName: "feature/test-mcp" });
  console.log("Branch created:", branch);

  // 2. Update a file
  const fileUpdate = await client.call("github.updateFile", {
    branch: "feature/test-mcp",
    path: "README.md",
    content: "Hello from MCP!",
    message: "Test MCP update",
  });
  console.log("File updated:", fileUpdate);

  // 3. Create a PR
  const pr = await client.call("github.createPR", {
    branch: "feature/test-mcp",
    title: "MCP Test PR",
    body: "This PR was created via MCP client/server",
  });
  console.log("PR created:", pr);
}

run();
