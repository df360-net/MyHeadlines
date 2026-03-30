import { Database } from "bun:sqlite";
import { copyFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { BrowserProfile } from "./browser-paths.js";

export interface HistoryDomain {
  domain: string;
  totalVisits: number;
  uniquePages: number;
  browser: string;
}

/**
 * Read browsing history from all discovered browser profiles.
 * Returns top visited domains (aggregated).
 */
export function readAllHistory(
  profiles: BrowserProfile[],
  topN: number = 50
): HistoryDomain[] {
  const domainMap = new Map<
    string,
    { totalVisits: number; uniquePages: number; browser: string }
  >();

  for (const profile of profiles) {
    if (!profile.historyPath) continue;

    try {
      const domains = readChromeHistory(profile, topN);
      console.log(
        `[scanner] ${profile.browser}/${profile.profileName}: ${domains.length} domains from history`
      );

      // Merge into aggregate map
      for (const d of domains) {
        const existing = domainMap.get(d.domain);
        if (existing) {
          existing.totalVisits += d.totalVisits;
          existing.uniquePages += d.uniquePages;
        } else {
          domainMap.set(d.domain, { ...d });
        }
      }
    } catch (err) {
      console.error(
        `[scanner] Failed to read history from ${profile.browser}/${profile.profileName}:`,
        (err as Error).message
      );
    }
  }

  // Sort by total visits and return top N
  return Array.from(domainMap.entries())
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.totalVisits - a.totalVisits)
    .slice(0, topN);
}

/**
 * Read history from a Chromium-based browser profile.
 * CRITICAL: The History SQLite file is locked while the browser is running.
 * We must copy it to a temp location first.
 */
function readChromeHistory(
  profile: BrowserProfile,
  topN: number
): HistoryDomain[] {
  const srcPath = profile.historyPath!;

  // Copy to temp location (browser holds a WAL lock on the original)
  const tmpDir = mkdtempSync(join(tmpdir(), "myheadlines-history-"));
  const tmpPath = join(tmpDir, "History");

  try {
    copyFileSync(srcPath, tmpPath);
    // Also copy WAL and SHM files for consistency
    try {
      copyFileSync(srcPath + "-wal", tmpPath + "-wal");
    } catch {
      // WAL may not exist — that's fine
    }
    try {
      copyFileSync(srcPath + "-shm", tmpPath + "-shm");
    } catch {
      // SHM may not exist — that's fine
    }

    const histDb = new Database(tmpPath, { readonly: true });

    const rows = histDb
      .prepare(
        `
      SELECT
        CASE
          WHEN url LIKE 'https://%' THEN
            SUBSTR(url, 9,
              CASE WHEN INSTR(SUBSTR(url, 9), '/') > 0
                THEN INSTR(SUBSTR(url, 9), '/') - 1
                ELSE LENGTH(SUBSTR(url, 9))
              END)
          WHEN url LIKE 'http://%' THEN
            SUBSTR(url, 8,
              CASE WHEN INSTR(SUBSTR(url, 8), '/') > 0
                THEN INSTR(SUBSTR(url, 8), '/') - 1
                ELSE LENGTH(SUBSTR(url, 8))
              END)
          ELSE url
        END as domain,
        SUM(visit_count) as total_visits,
        COUNT(*) as unique_pages
      FROM urls
      WHERE url LIKE 'http%'
        AND url NOT LIKE '%localhost%'
        AND url NOT LIKE '%127.0.0.1%'
        AND url NOT LIKE '%://192.168.%'
      GROUP BY domain
      HAVING total_visits > 1
      ORDER BY total_visits DESC
      LIMIT ?
    `
      )
      .all(topN) as Array<{
      domain: string;
      total_visits: number;
      unique_pages: number;
    }>;

    histDb.close();

    return rows.map((r) => ({
      domain: r.domain,
      totalVisits: r.total_visits,
      uniquePages: r.unique_pages,
      browser: profile.browser,
    }));
  } finally {
    // Clean up temp files
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      // Best effort cleanup
    }
  }
}
