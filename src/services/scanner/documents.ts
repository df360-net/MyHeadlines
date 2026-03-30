import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { execSync } from "child_process";

export interface DocumentSummary {
  totalFiles: number;
  extensions: Record<string, number>;
  topFolders: string[];
}

const SCAN_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml",
  ".py", ".js", ".ts", ".java", ".go", ".rs", ".cpp", ".c",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "__pycache__",
  ".cache", ".vscode", ".idea", "vendor", "target",
]);

/**
 * Scan the Documents folder for file names and types.
 * Only reads names and extensions — never reads file contents.
 */
export async function scanDocuments(maxDepth: number = 5): Promise<DocumentSummary> {
  const docsPath = getDocumentsPath();
  console.log(`[scanner] Scanning documents at: ${docsPath}`);

  const extensions: Record<string, number> = {};
  const topFolders: Set<string> = new Set();
  let totalFiles = 0;

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or other error
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (depth === 0) topFolders.add(entry.name);
        await walk(join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (ext && SCAN_EXTENSIONS.has(ext)) {
          extensions[ext] = (extensions[ext] || 0) + 1;
          totalFiles++;
        }
      }
    }
  }

  await walk(docsPath, 0);

  console.log(
    `[scanner] Documents: ${totalFiles} files, ${Object.keys(extensions).length} file types, ${topFolders.size} top folders`
  );

  return {
    totalFiles,
    extensions,
    topFolders: Array.from(topFolders).slice(0, 30),
  };
}

/**
 * Get the actual Documents folder path.
 * Handles Windows OneDrive redirection.
 */
function getDocumentsPath(): string {
  if (process.platform === "win32") {
    try {
      const path = execSync(
        `powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`,
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (path) return path;
    } catch {
      // Fallback
    }
    return join(process.env.USERPROFILE || process.env.HOME || ".", "Documents");
  }

  return join(process.env.HOME || ".", "Documents");
}
