#!/usr/bin/env node
// fetchFigma.js
import axios from "axios";
import fs from "fs/promises";
import minimist from "minimist";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const FIGMA_TOKEN = process.env.FIGMA_TOKEN; // Set this in your env

if (!FIGMA_TOKEN) {
  console.error("Missing FIGMA_TOKEN. Run: export FIGMA_TOKEN=your-token");
  process.exit(1);
}

// Extract fileKey and nodeId(s) from Figma URL
function parseFigmaUrl(url) {
  // Support both /file/ and /design/ URLs
  const m = url.match(/\/(file|design)\/([a-zA-Z0-9]+)\//);
  if (!m) throw new Error("Could not extract fileKey from Figma URL");
  const fileKey = m[2];

  const nodeMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : null;

  return { fileKey, nodeId };
}

// Normalize Figma paint (fills) to hex
function paintToHex(paint) {
  if (!paint || paint.type !== "SOLID") return null;
  const { r, g, b } = paint.color;
  const to255 = c => Math.round(c * 255);
  return (
    "#" +
    [to255(r), to255(g), to255(b)]
      .map(x => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

// Normalize node to something like extractor output
function normalizeNode(node) {
  const style = node.styles || {};
  const fills = node.fills || [];
  const text = node.characters || "";

  // Recursively normalize children if present
  let children = [];
  if (Array.isArray(node.children) && node.children.length > 0) {
    children = node.children.map(child => normalizeNode(child));
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    bounding: node.absoluteBoundingBox
      ? {
          x: node.absoluteBoundingBox.x,
          y: node.absoluteBoundingBox.y,
          width: node.absoluteBoundingBox.width,
          height: node.absoluteBoundingBox.height
        }
      : null,
    computed: {
      color: fills.length ? paintToHex(fills[0]) : null,
      fontSize: node.style?.fontSize || null,
      fontFamily: node.style?.fontFamily || null,
      fontWeight: node.style?.fontWeight || null,
      lineHeight: node.style?.lineHeightPx
        ? `${node.style.lineHeightPx}px`
        : null,
      borderRadius: node.cornerRadius || 0,
      boxShadow: node.effects?.length ? JSON.stringify(node.effects) : null
    },
    text,
    children
  };
}

async function fetchFigma(fileKey, nodeId) {
  const url = nodeId
    ? `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`
    : `https://api.figma.com/v1/files/${fileKey}`;

  const res = await axios.get(url, {
    headers: { "X-Figma-Token": FIGMA_TOKEN }
  });

  if (res.status !== 200) {
    throw new Error(`Figma API failed: ${res.status} ${res.statusText}`);
  }

  return res.data;
}

async function run(figmaUrl) {
  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  console.log(`Fetching Figma fileKey=${fileKey}, nodeId=${nodeId}`);

  const raw = await fetchFigma(fileKey, nodeId);


  let nodes = [];
  if (raw.nodes) {
    // Specific nodes
    nodes = Object.values(raw.nodes).map(n => normalizeNode(n.document));
  } else if (raw.document) {
    // Entire file root
    nodes = [normalizeNode(raw.document)];
  }

  const outFile = path.join("./artifacts", `figma_${Date.now()}.json`);
  await fs.mkdir("./artifacts", { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(nodes, null, 2));
  console.log(`Saved normalized Figma JSON to ${outFile}`);
}

const argv = minimist(process.argv.slice(2));
const figmaUrl = argv.url || argv.u;

if (!figmaUrl) {
  console.error("Usage: node fetchFigma.js --url=https://www.figma.com/file/FILE_KEY/Project?node-id=123-456");
  process.exit(1);
}

run(figmaUrl).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
