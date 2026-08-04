// src/scripts/validate.ts
// 校验 content/ 下所有 Markdown 文件的 frontmatter 格式和跨文件引用
import fs from 'fs/promises';
import { scanContentDir } from "../parser/content-manager.js";
import { parseFrontmatterWithWarnings } from "../parser/frontmatter.js";
import {
  isValidEssence,
  isValidField,
  isValidTier,
  isValidEdgeType,
} from "../parser/schema.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

// VALID_* whitelists live in src/parser/schema.ts. Both validate and
// audit-frontmatter import the same readonly tuples, so the two scripts
// can no longer silently disagree on what counts as a canonical value.

interface ValidationError {
  file: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export async function validate(): Promise<void> {
  console.log("🔍 Running frontmatter validation...\n");

  const contentDir = path.join(ROOT, "public/content");
  const files = await scanContentDir(contentDir);

  if (files.length === 0) {
    console.warn("⚠️  No .md files found in public/content/");
    return;
  }

  console.log(`   Scanning ${files.length} file(s)...\n`);

  const errors: ValidationError[] = [];
  const allIds = new Set<string>();

  // Pass 1: collect all node IDs and validate structural fields
  for (const fp of files) {
    const raw = await fs.readFile(fp, 'utf-8');
    const relPath = toRelativePath(fp);

    let result: ReturnType<typeof parseFrontmatterWithWarnings>;
    try {
      result = parseFrontmatterWithWarnings(raw, fp);
    } catch (err: any) {
      errors.push({ file: relPath, message: err.message, severity: "error" });
      continue;
    }
    const { fm, warnings } = result;

    // Surface parser-emitted warnings so the CLI output mirrors what the
    // browser sees (issue #14). The parser decides *structural* problems
    // (missing target, non-object edge); this script keeps *value-list*
    // problems (essence/field/tier/edge-type not in the whitelist).
    for (const w of warnings) {
      errors.push({
        file: relPath,
        field: w.field ?? undefined,
        message: w.message,
        severity: w.severity,
      });
    }

    // Collect node IDs for cross-reference validation
    allIds.add(fm.id);

    // Validate essence field
    if (fm.essence && !isValidEssence(fm.essence)) {
      errors.push({
        file: relPath,
        field: 'essence',
        message: `essence 值 "${fm.essence}" 不在已知类型列表中`,
        severity: 'warning',
      });
    }

    // Validate field field
    if (fm.field && !isValidField(fm.field)) {
      errors.push({
        file: relPath,
        field: 'field',
        message: `field 值 "${fm.field}" 不在已知类型列表中`,
        severity: 'warning',
      });
    }

    // Validate tier field
    if (fm.tier && !isValidTier(fm.tier)) {
      errors.push({
        file: relPath,
        field: 'tier',
        message: `tier 值 "${fm.tier}" 不在已知层级列表中`,
        severity: 'warning',
      });
    }

    // Validate edges_out structure (value-list check stays here; structural
    // issues are already covered by the parser-emitted warnings above).
    if (fm.edges_out && Array.isArray(fm.edges_out)) {
      for (let i = 0; i < fm.edges_out.length; i++) {
        const edge = fm.edges_out[i];

        if (edge.type && !isValidEdgeType(edge.type)) {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].type`,
            message: `edges_out[${i}].type 值 "${edge.type}" 不在已知类型列表中`,
            severity: 'warning',
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
      const { fm } = parseFrontmatterWithWarnings(raw, fp);
      if (!fm.edges_out) continue;

      for (let i = 0; i < fm.edges_out.length; i++) {
        const edge = fm.edges_out[i];
        const target = String(edge.target ?? "").trim();
        if (target && !allIds.has(target)) {
          errors.push({
            file: relPath,
            field: `edges_out[${i}].target`,
            message: `edges_out[${i}].target 指向的节点 id "${target}" 不存在`,
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
