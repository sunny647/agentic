#!/usr/bin/env node
// fetchFigma.js
import axios from "axios";
import fs from "fs/promises";
import minimist from "minimist";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { json } from "stream/consumers";

// Always load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(projectRoot, '.env') });

const FIGMA_TOKEN = process.env.FIGMA_TOKEN; // Set this in your env
console.log("Using FIGMA_TOKEN:", FIGMA_TOKEN ? FIGMA_TOKEN : "NOT SET");
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

async function fetchFigmaScreenshots(fileKey, nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return {};

  // Figma API only allows up to 100 node IDs per request
  const screenshotPaths = {};
  await fs.mkdir("./artifacts/figma-screenshots", { recursive: true });

  for (let i = 0; i < nodeIds.length; i += 100) {
    const batch = nodeIds.slice(i, i + 100);
    const idsParam = batch.join(',').replace(/:/g, '-');
    const imageUrlsApi = `https://api.figma.com/v1/files/${fileKey}/images?ids=${idsParam}&scale=2&format=png`;
    console.log(`Fetching Figma image URLs for nodes for file ${fileKey} : ${idsParam}`);
    const res = await axios.get(imageUrlsApi, {
      headers: { "X-Figma-Token": FIGMA_TOKEN }
    });
    if (res.status !== 200) {
      throw new Error(`Figma Image API failed: ${res.status} ${res.statusText}`);
    }
    const { images } = res.data.meta;
    const outFile = path.join("./artifacts", `figma_raw_images_${Date.now()}.json`);
  await fs.mkdir("./artifacts", { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(res.data, null, 2));
    for (const nodeId in images) {
      const imageUrl = images[nodeId];
      if (imageUrl) {
        const fileName = `figma_node_${nodeId}_${Date.now()}.png`;
        const filePath = path.join("./artifacts/figma-screenshots", fileName);
        console.log(`Downloading Figma image for node ${nodeId}`);
        const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        await fs.writeFile(filePath, imageRes.data);
        screenshotPaths[nodeId] = filePath;
      } else {
        console.warn(`No image URL found for Figma node ${nodeId}. It might be hidden or a non-renderable type.`);
      }
    }
  }
  return screenshotPaths;
}

// Recursively collect all node IDs from normalized node tree
function collectNodeIds(nodes) {
  let ids = [];
  for (const node of nodes) {
    if (node.id) ids.push(node.id);
    if (Array.isArray(node.children) && node.children.length > 0) {
      ids = ids.concat(collectNodeIds(node.children));
    }
  }
  return ids;
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

  // Recursively collect all node IDs from normalized node tree
  const allNodeIds = collectNodeIds(nodes);
  const figmaScreenshots = await fetchFigmaScreenshots(fileKey, allNodeIds);

  // Recursively attach screenshots to nodes and children
  function attachScreenshots(node) {
    if (figmaScreenshots[node.id]) {
      node.screenshot = figmaScreenshots[node.id];
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      node.children.forEach(child => attachScreenshots(child));
    }
  }
  nodes.forEach(node => attachScreenshots(node));

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
