import { join } from "path";
import { existsSync } from "fs";

export type BrowserType = "chrome" | "edge" | "firefox";

export interface BrowserProfile {
  browser: BrowserType;
  profileName: string;
  bookmarksPath: string | null;
  historyPath: string | null;
}

/**
 * Discover all installed browser profiles on the system.
 */
export function discoverBrowserProfiles(): BrowserProfile[] {
  const profiles: BrowserProfile[] = [];
  const isWin = process.platform === "win32";

  // Chrome
  const chromeBase = isWin
    ? join(process.env.LOCALAPPDATA!, "Google", "Chrome", "User Data")
    : join(process.env.HOME!, "Library", "Application Support", "Google", "Chrome");

  profiles.push(...findChromiumProfiles("chrome", chromeBase));

  // Edge
  const edgeBase = isWin
    ? join(process.env.LOCALAPPDATA!, "Microsoft", "Edge", "User Data")
    : join(process.env.HOME!, "Library", "Application Support", "Microsoft Edge");

  profiles.push(...findChromiumProfiles("edge", edgeBase));

  const found = profiles.filter((p) => p.bookmarksPath || p.historyPath);
  console.log(
    `[scanner] Found ${found.length} browser profile(s): ${found.map((p) => `${p.browser}/${p.profileName}`).join(", ") || "none"}`
  );

  return found;
}

/**
 * Find Chromium-based browser profiles (Chrome, Edge, Brave, etc.)
 */
function findChromiumProfiles(
  browser: BrowserType,
  basePath: string
): BrowserProfile[] {
  const profiles: BrowserProfile[] = [];

  if (!existsSync(basePath)) return profiles;

  // Check Default profile and numbered profiles
  const profileDirs = ["Default", "Profile 1", "Profile 2", "Profile 3"];

  for (const dir of profileDirs) {
    const profilePath = join(basePath, dir);
    if (!existsSync(profilePath)) continue;

    const bookmarksPath = join(profilePath, "Bookmarks");
    const historyPath = join(profilePath, "History");

    profiles.push({
      browser,
      profileName: dir,
      bookmarksPath: existsSync(bookmarksPath) ? bookmarksPath : null,
      historyPath: existsSync(historyPath) ? historyPath : null,
    });
  }

  return profiles;
}
