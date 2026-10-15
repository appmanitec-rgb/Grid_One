import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const suite = JSON.parse(readFileSync(new URL("../../scripts/e2e-suite.json", import.meta.url), "utf8"));
const phase = process.argv[2];
if (!["menus", "flows"].includes(phase)) throw new Error("Use menus ou flows.");
const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, "test", ...suite[phase], "--project=chromium", "--workers=1", "--max-failures=0"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});
process.exit(result.status ?? 1);
