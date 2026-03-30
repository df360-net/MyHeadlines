import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { importedUrls } from "../../db/schema.js";
import { discoverBrowserProfiles } from "./browser-paths.js";
import { readAllBookmarks } from "./bookmarks.js";
import { readAllHistory } from "./history.js";
import { getInstalledApps } from "./apps.js";
import { scanDocuments } from "./documents.js";
import { sql } from "drizzle-orm";
import { extractDomain } from "../../shared/utils.js";

export interface ScanResult {
  bookmarkCount: number;
  historyDomainCount: number;
  appCount: number;
  documentFileCount: number;
  topDomains: string[];
  topApps: string[];
}

/**
 * Run a full scan of the owner's computer to build their initial profile.
 * Scans: browser bookmarks, browser history, installed apps, document folder.
 */
export async function runFullScan(): Promise<ScanResult> {
  console.log("[scanner] Starting full computer scan...");
  const startTime = Date.now();

  // 1. Discover browser profiles
  const profiles = discoverBrowserProfiles();

  // 2. Read bookmarks
  const bookmarks = readAllBookmarks(profiles);

  // 3. Read browsing history (top 50 domains)
  const historyDomains = readAllHistory(profiles, 50);

  // 4. Get installed applications
  const apps = getInstalledApps();
  console.log(`[scanner] Found ${apps.length} installed applications`);

  // 5. Scan documents folder
  const docSummary = await scanDocuments();

  // 6. Store bookmark URLs in database
  const insertCount = storeImportedData(bookmarks, historyDomains, apps, docSummary);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[scanner] Scan complete in ${elapsed}s — ${insertCount} items stored`);

  return {
    bookmarkCount: bookmarks.length,
    historyDomainCount: historyDomains.length,
    appCount: apps.length,
    documentFileCount: docSummary.totalFiles,
    topDomains: historyDomains.slice(0, 10).map((d) => d.domain),
    topApps: apps.slice(0, 20).map((a) => a.name),
  };
}

function storeImportedData(
  bookmarks: ReturnType<typeof readAllBookmarks>,
  historyDomains: ReturnType<typeof readAllHistory>,
  apps: ReturnType<typeof getInstalledApps>,
  docSummary: Awaited<ReturnType<typeof scanDocuments>>
): number {
  let count = 0;
  const now = new Date();

  // Store bookmarks
  for (const bm of bookmarks) {
    const domain = extractDomain(bm.url);
    db.insert(importedUrls)
      .values({
        id: nanoid(12),
        url: bm.url,
        title: bm.title,
        domain,
        visitCount: null,
        extractedTopics: null,
        source: "bookmark",
        importedAt: now,
      })
      .onConflictDoNothing()
      .run();
    count++;
  }

  // Store top history domains
  for (const hd of historyDomains) {
    db.insert(importedUrls)
      .values({
        id: nanoid(12),
        url: `https://${hd.domain}`,
        title: hd.domain,
        domain: hd.domain,
        visitCount: hd.totalVisits,
        extractedTopics: null,
        source: "history",
        importedAt: now,
      })
      .onConflictDoNothing()
      .run();
    count++;
  }

  // Store installed apps as a single summary entry
  if (apps.length > 0) {
    const appNames = apps.map((a) => a.name);
    db.insert(importedUrls)
      .values({
        id: nanoid(12),
        url: "local://installed-apps",
        title: `${apps.length} installed applications`,
        domain: null,
        visitCount: null,
        extractedTopics: JSON.stringify(appNames.slice(0, 50)),
        source: "app",
        importedAt: now,
      })
      .onConflictDoNothing()
      .run();
    count++;
  }

  // Store document summary as a single entry
  if (docSummary.totalFiles > 0) {
    db.insert(importedUrls)
      .values({
        id: nanoid(12),
        url: "local://documents",
        title: `${docSummary.totalFiles} document files`,
        domain: null,
        visitCount: null,
        extractedTopics: JSON.stringify({
          extensions: docSummary.extensions,
          topFolders: docSummary.topFolders,
        }),
        source: "document",
        importedAt: now,
      })
      .onConflictDoNothing()
      .run();
    count++;
  }

  return count;
}

