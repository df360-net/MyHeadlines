import { readFileSync } from "fs";
import type { BrowserProfile } from "./browser-paths.js";

export interface Bookmark {
  title: string;
  url: string;
  folder: string;
  browser: string;
}

interface ChromeBookmarkNode {
  type: "url" | "folder";
  name: string;
  url?: string;
  date_added?: string;
  children?: ChromeBookmarkNode[];
}

interface ChromeBookmarksFile {
  roots: {
    bookmark_bar: { children: ChromeBookmarkNode[] };
    other: { children: ChromeBookmarkNode[] };
    synced: { children: ChromeBookmarkNode[] };
  };
}

/**
 * Read bookmarks from all discovered browser profiles.
 */
export function readAllBookmarks(profiles: BrowserProfile[]): Bookmark[] {
  const allBookmarks: Bookmark[] = [];

  for (const profile of profiles) {
    if (!profile.bookmarksPath) continue;

    try {
      const bookmarks = readChromeBookmarks(profile);
      allBookmarks.push(...bookmarks);
      console.log(
        `[scanner] ${profile.browser}/${profile.profileName}: ${bookmarks.length} bookmarks`
      );
    } catch (err) {
      console.error(
        `[scanner] Failed to read bookmarks from ${profile.browser}/${profile.profileName}:`,
        (err as Error).message
      );
    }
  }

  return allBookmarks;
}

/**
 * Read bookmarks from a Chromium-based browser profile.
 * Bookmarks file is plain JSON — not locked, safe to read directly.
 */
function readChromeBookmarks(profile: BrowserProfile): Bookmark[] {
  const raw = readFileSync(profile.bookmarksPath!, "utf-8");
  const data: ChromeBookmarksFile = JSON.parse(raw);

  const bookmarks: Bookmark[] = [];

  const roots = [
    { node: data.roots.bookmark_bar, folder: "Bookmarks Bar" },
    { node: data.roots.other, folder: "Other" },
    { node: data.roots.synced, folder: "Synced" },
  ];

  for (const { node, folder } of roots) {
    if (node?.children) {
      flattenBookmarks(node.children, folder, profile.browser, bookmarks);
    }
  }

  return bookmarks;
}

function flattenBookmarks(
  nodes: ChromeBookmarkNode[],
  folder: string,
  browser: string,
  results: Bookmark[]
) {
  for (const node of nodes) {
    if (node.type === "url" && node.url) {
      // Skip internal browser pages
      if (
        node.url.startsWith("chrome://") ||
        node.url.startsWith("edge://") ||
        node.url.startsWith("about:")
      ) {
        continue;
      }

      results.push({
        title: node.name,
        url: node.url,
        folder,
        browser,
      });
    } else if (node.type === "folder" && node.children) {
      const subFolder = folder ? `${folder}/${node.name}` : node.name;
      flattenBookmarks(node.children, subFolder, browser, results);
    }
  }
}
