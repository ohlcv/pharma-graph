// src/parser/frontmatter.ts
import matter from "gray-matter";
import path from "path";

// --- frontmatter 字段类型 ---

export interface NodeMeta {
  id: string;
  label: string;
  type: string;
  category: string;
  summary?: string;
}

export interface EdgeDef {
  target: string; // 目标节点 id
  type: string;    // 关系类型
  reason?: string;
}

export interface ParsedFrontmatter extends NodeMeta {
  edges_out?: EdgeDef[];
}

const REQUIRED_FIELDS = ["id", "type", "category"];

/**
 * 解析 frontmatter，返回结构化元数据
 * @param raw 完整 Markdown 原文
 * @param filePath 用于从路径推断 label（如果 frontmatter 中未提供）
 */
export function parseFrontmatter(raw: string, filePath: string): ParsedFrontmatter {
  const { data, content } = matter(raw);

  const missing = REQUIRED_FIELDS.filter((f) => !(f in data));
  if (missing.length > 0) {
    throw new Error(
      `frontmatter 缺少必需字段 [${missing.join(", ")}]，文件: ${filePath}`
    );
  }

  const id = String(data["id"]).trim();
  if (!id) {
    throw new Error(`frontmatter id 不能为空，文件: ${filePath}`);
  }

  const label =
    typeof data["label"] === "string" && data["label"].trim()
      ? data["label"].trim()
      : path.basename(filePath, ".md");

  const summary =
    typeof data["summary"] === "string" ? data["summary"].trim() : undefined;

  const edges_out: EdgeDef[] = Array.isArray(data["edges_out"])
    ? (data["edges_out"] as unknown[])
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && !Array.isArray(e))
        .map((e): EdgeDef => ({
          target: String(e["target"] ?? ""),
          type: String(e["type"] ?? "related"),
          reason: typeof e["reason"] === "string" ? e["reason"] : undefined,
        }))
        .filter((e): e is EdgeDef => Boolean(e.target))
    : [];

  return {
    id,
    label,
    type: String(data["type"]),
    category: String(data["category"]),
    summary,
    edges_out: edges_out.length > 0 ? edges_out : undefined,
  };
}
