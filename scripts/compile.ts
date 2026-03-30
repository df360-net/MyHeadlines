/**
 * Compile script: reads .env.build and passes secrets via --define
 * so they get baked into the binary without appearing in source code.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { $ } from "bun";

const ROOT = join(import.meta.dir, "..");
const ENV_FILE = join(ROOT, ".env.build");

// Read .env.build
const env: Record<string, string> = {};
if (existsSync(ENV_FILE)) {
  const lines = readFileSync(ENV_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
}

const resendKey = env.RESEND_API_KEY || "";
const awsKeyId = env.AWS_ACCESS_KEY_ID || "";
const awsSecret = env.AWS_SECRET_ACCESS_KEY || "";
const awsRegion = env.AWS_REGION || "us-east-1";

const defines = [
  `--define`, `__BUILTIN_RESEND_KEY__='${resendKey}'`,
  `--define`, `__BUILTIN_AWS_ACCESS_KEY_ID__='${awsKeyId}'`,
  `--define`, `__BUILTIN_AWS_SECRET_ACCESS_KEY__='${awsSecret}'`,
  `--define`, `__BUILTIN_AWS_REGION__='${awsRegion}'`,
];

const targets = [
  { name: "MyHeadlines", target: [] as string[] },                          // current platform
  { name: "MyHeadlines-mac-arm64", target: ["--target=bun-darwin-arm64"] }, // Apple Silicon
  { name: "MyHeadlines-mac-x64", target: ["--target=bun-darwin-x64"] },    // Intel Mac
];

for (const t of targets) {
  const args = ["bun", "build", "--compile", ...defines, ...t.target, "src/main.ts", "--outfile", t.name];
  console.log(`[compile] Building ${t.name}...`);
  const result = Bun.spawnSync(args, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
  if (result.exitCode !== 0) {
    console.error(`[compile] Failed to build ${t.name}`);
    process.exit(1);
  }
}

console.log(`\n[compile] Done! Built all 3 binaries with embedded keys (SES: ${awsKeyId ? "yes" : "no"}, Resend: ${resendKey ? "yes" : "no"}).`);
