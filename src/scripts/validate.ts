// src/scripts/validate.ts
// 校验 content/ 下所有 Markdown 文件的 frontmatter 格式和跨文件引用
import fs from 'fs/promises';
import { scanContentDir } from "../parser/content-manager.js";
import { parseFrontmatter } from "../parser/frontmatter.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

const VALID_NODE_TYPES = [
  "concept",
  "drug",
  "mechanism",
  "disease",
  "ingredient",
];

const VALID_EDGE_TYPES = [
  "isa",
  "part_of",
  "mechanism",
  "causes",
  "treats",
  "has",
  "relates",
];

interface ValidationError {
  file: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export async function validate(): Promise<void> {
  console.log("🔍 Running frontmatter validation...\n");

  const contentDir = path.join(ROOT, "content");
  const files = await scanContentDir(contentDir);

  if (files.length === 0) {
    console.warn("⚠️  No .md files found in content/");
    return;
  }

  console.log(`   Scanning ${files.length} file(s)...\n`);

  const errors: ValidationError[] = [];
  const allIds = new Set<string>();

  // Pass 1: collect all node IDs and validate structural fields
  for (const fp of files) {
    const raw = await fs.readFile(fp, 'utf-8');
    const relPath = toRelativePath(fp);

    let fm: ReturnType<typeof parseFrontmatter>;
    try {
      fm = parseFrontmatter(raw, fp);
    } catch (err: any) {
      errors.push({ file: relPath, message: err.message, severity: "error" });
      continue;
    }

    // Collect node IDs for cross-reference validation
    allIds.add(fm.id);

    // Validate type field
    if (!VALID_NODE_TYPES.includes(fm.type)) {
      errors.push({
        file: relPath,
        field: "type",
        message: `type 值 "${fm.type}" 不在已知类型列表中 (${VALID_NODE_TYPES.join(", ")})`,
        severity: "warning",
      });
    }

    // Validate category field
    if (!fm.category || String(fm.category).trim() === "") {
      errors.push({
        file: relPath,
        field: "category",
        message: "category 不能为空",
        severity: "error",
      });
    }

    // Validate edges_out structure
    if (fm.edges_out && Array.isArray(fm.edges_out)) {
      for (let i = 0; i < fm.edges_out.length; i++) {
        const edge = fm.edges_out[i];

        if (!edge.target || String(edge.target).trim() === "") {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].target`,
            message: `edges_out[${i}].target 不能为空`,
            severity: "error",
          });
        }

        if (edge.type && !VALID_EDGE_TYPES.includes(edge.type)) {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].type`,
            message: `edges_out[${i}].type 值 "${edge.type}" 不在已知类型列表中 (${VALID_EDGE_TYPES.join(", ")})`,
            severity: "warning",
          });
        }
      }
    }
  }

  // Pass 2: cross-reference — check that all edges_out.target 指向已存在的节点
  for (const fp of files) {
    const raw = await fs.readFile(fp, 'utf-8');
    const relPath = toRelativePath(fp);

    try {
      const fm = parseFrontmatter(raw, fp);
      if (!fm.edges_out) continue;

      for (let i = 0; i < fm.edges_out.length; i++) {
        const edge = fm.edges_out[i];
        const target = String(edge.target ?? "").trim();
        if (target && !allIds.has(target)) {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].target`,
            message: `edges_out[${i}].target 指向的节点 id "${target}" 不存在（尚未在任何文件的 id 字段中定义）`,
            severity: "error",
          });
        }
      }
    } catch {
      // Already reported in pass 1
    }
  }

  // Report results
  if (errors.length === 0) {
    console.log("✅ All files passed validation.");
    return;
  }

  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warnCount = errors.filter((e) => e.severity === "warning").length;

  if (errorCount > 0) {
    console.error(`❌ ${errorCount} error(s), ${warnCount} warning(s)\n`);
  } else {
    console.warn(`⚠️  ${warnCount} warning(s)\n`);
  }

  for (const err of errors) {
    const icon = err.severity === "error" ? "❌" : "⚠️ ";
    const location = err.field ? `[${err.field}]` : "";
    console.error(`${icon} ${err.file} ${location}`);
    console.error(`   ${err.message}\n`);
  }

  if (errorCount > 0) {
    process.exit(1);
  }
}

function toRelativePath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === "content");
  return idx === -1 ? filePath : parts.slice(idx).join("/");
}

// Run if executed directly
validate().catch((err) => {
  console.error("❌ Validation crashed:", err.message);
  process.exit(1);
});
