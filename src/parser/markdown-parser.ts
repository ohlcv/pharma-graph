// src/parser/markdown-parser.ts
import fs from "fs/promises";

export interface MarkdownMeta {
  title: string;
  rawContent: string; // frontmatter 之后的纯 Markdown 内容
  filePath: string;
}

/**
 * 读取 .md 文件，提取标题（从文件名推断）和正文内容
 * @param filePath 文件绝对路径
 */
export async function parseMarkdown(filePath: string): Promise<MarkdownMeta> {
  const raw = await fs.readFile(filePath, "utf-8");

  // 从文件名推断标题（去掉扩展名，取最后一段路径作为 fallback）
  const fileName = filePath.split(/[/\\]/).pop() ?? "untitled";
  const title = fileName.replace(/\.md$/, "");

  return {
    title,
    rawContent: raw,
    filePath,
  };
}
