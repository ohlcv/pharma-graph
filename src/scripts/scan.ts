// src/scripts/scan.ts
// 入口脚本：扫描 content/ → 构建节点 → 构建边 → 输出 JSON
import { scanContentDir } from "../parser/content-manager.js";
import { buildNodes } from "../core/node-builder.js";
import { buildEdges } from "../core/edge-builder.js";
import { GraphData } from "../core/graph.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const OUT_FILE = path.join(ROOT, "dist", "graph-data.json");

async function main() {
  console.log("🔍 Scanning content/ ...");
  const files = await scanContentDir(path.join(ROOT, "content"));

  if (files.length === 0) {
    console.warn("⚠️  No .md files found in content/");
  } else {
    console.log(`✅ Found ${files.length} file(s)`);
  }

  console.log("📦 Building nodes ...");
  const nodes = await buildNodes(files);

  console.log("🔗 Building edges ...");
  const edges = await buildEdges(files);

  const graphData: GraphData = { nodes, edges };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify(graphData, null, 2), "utf-8");

  console.log(`✅ Output written to ${OUT_FILE}`);
  console.log(`   nodes: ${nodes.length}, edges: ${edges.length}`);
}

main().catch((err) => {
  console.error("❌ Scan failed:", err.message);
  process.exit(1);
});
