/**
 * Build script: creates macOS .app bundles for both ARM64 and x64.
 *
 * Produces:
 *   MyHeadlines-arm64.app/  (Apple Silicon: M1/M2/M3/M4)
 *   MyHeadlines-x64.app/    (Intel Macs)
 *
 * Each is a valid macOS .app bundle that users can double-click.
 * The launcher script starts the server and opens the browser.
 */
import { mkdirSync, writeFileSync, chmodSync, existsSync, rmSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>net.df360.myheadlines</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleName</key>
    <string>MyHeadlines</string>
    <key>CFBundleDisplayName</key>
    <string>MyHeadlines</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>`;

const LAUNCHER_SCRIPT = `#!/bin/bash
# MyHeadlines launcher — starts the server and opens the browser.
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
BINARY="$DIR/../Resources/myheadlines"

# Make sure the binary is executable
chmod +x "$BINARY" 2>/dev/null

# Start the server in background
"$BINARY" &
SERVER_PID=$!

# Wait for server to be ready (up to 10 seconds)
for i in {1..20}; do
    if curl -s http://127.0.0.1:3456/api/health >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

# Open browser
open "http://127.0.0.1:3456"

# Wait for the server process — when it exits, the app exits
wait $SERVER_PID
`;

interface Target {
  arch: string;
  bunTarget: string;
  binaryFile: string;
}

const targets: Target[] = [
  { arch: "arm64", bunTarget: "bun-darwin-arm64", binaryFile: "MyHeadlines-mac-arm64" },
  { arch: "x64", bunTarget: "bun-darwin-x64", binaryFile: "MyHeadlines-mac-x64" },
];

for (const target of targets) {
  const appName = `MyHeadlines-${target.arch}.app`;
  const appDir = join(ROOT, appName);

  // Clean previous build
  if (existsSync(appDir)) {
    rmSync(appDir, { recursive: true });
  }

  // Create bundle structure
  const contentsDir = join(appDir, "Contents");
  const macosDir = join(contentsDir, "MacOS");
  const resourcesDir = join(contentsDir, "Resources");

  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resourcesDir, { recursive: true });

  // Write Info.plist
  writeFileSync(join(contentsDir, "Info.plist"), INFO_PLIST);

  // Write launcher script
  const launcherPath = join(macosDir, "launcher");
  writeFileSync(launcherPath, LAUNCHER_SCRIPT, { mode: 0o755 });

  // Copy the compiled binary into Resources
  const binaryPath = join(ROOT, target.binaryFile);
  if (!existsSync(binaryPath)) {
    console.error(`[build-mac-app] Binary not found: ${target.binaryFile}`);
    console.error(`  Run first: bun build --compile --target=${target.bunTarget} src/main.ts --outfile ${target.binaryFile}`);
    continue;
  }

  const destBinary = join(resourcesDir, "myheadlines");
  const data = Bun.file(binaryPath);
  await Bun.write(destBinary, data);

  console.log(`[build-mac-app] Created ${appName} (${target.arch})`);
}

console.log();
console.log("[build-mac-app] Done! To distribute:");
console.log("  1. Zip each .app folder: zip -r MyHeadlines-arm64.zip MyHeadlines-arm64.app");
console.log("  2. Users download, unzip, and double-click to run");
console.log("  3. First launch: macOS may ask to allow — right-click > Open to bypass Gatekeeper");
