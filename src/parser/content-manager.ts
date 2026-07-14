// src/parser/content-manager.ts
import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 扫描 content 目录，返回所有 .md 文件的绝对路径列表
 * @param dir 目标目录，默认相对于项目根的 content/
 */
export async function scanContentDir(dir?: string): Promise<string[]> {
  const rootDir = dir ?? path.resolve(__dirname, "../../public/content");
  const files = await glob("**/*.md", { cwd: rootDir, absolute: false });
  return files
    .filter((f) => !f.startsWith("dist/"))
    .map((f) => path.join(rootDir, f))
    .sort();
}
