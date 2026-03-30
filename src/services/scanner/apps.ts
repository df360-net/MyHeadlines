import { execSync } from "child_process";

export interface InstalledApp {
  name: string;
  publisher: string;
}

/**
 * Get installed applications on the system.
 */
export function getInstalledApps(): InstalledApp[] {
  if (process.platform === "win32") {
    return getWindowsApps();
  } else if (process.platform === "darwin") {
    return getMacApps();
  }
  return [];
}

function getWindowsApps(): InstalledApp[] {
  try {
    const psScript = [
      "$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
      "Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.DisplayName -ne '' } | Select-Object DisplayName, Publisher | Sort-Object DisplayName -Unique | ConvertTo-Json -Compress",
    ].join("; ");

    const result = execSync(`powershell -NoProfile -Command "${psScript}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15000,
    });

    const apps = JSON.parse(result);
    const list = Array.isArray(apps) ? apps : [apps];

    return list
      .map((a: { DisplayName?: string; Publisher?: string }) => ({
        name: a.DisplayName || "",
        publisher: a.Publisher || "",
      }))
      .filter((a: InstalledApp) => a.name.length > 0);
  } catch (err) {
    console.error("[scanner] Failed to read Windows apps:", (err as Error).message);
    return [];
  }
}

function getMacApps(): InstalledApp[] {
  try {
    const { readdirSync } = require("fs");
    const { join } = require("path");

    const appDirs = ["/Applications", join(process.env.HOME!, "Applications")];
    const apps: InstalledApp[] = [];

    for (const dir of appDirs) {
      try {
        const entries = readdirSync(dir).filter((f: string) =>
          f.endsWith(".app")
        );
        for (const entry of entries) {
          apps.push({
            name: entry.replace(".app", ""),
            publisher: "",
          });
        }
      } catch {
        // Directory may not exist
      }
    }

    return apps;
  } catch {
    return [];
  }
}
