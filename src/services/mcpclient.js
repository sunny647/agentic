// mcpClient.js
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

export class MCPClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        console.log("✅ Connected to MCP server:", this.url);
        resolve();
      });

      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);

          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      });

      this.ws.on("error", reject);
    });
  }

  async call(method, params = {}) {
    const id = uuidv4();
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}
