import { spawn, spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(currentDir, "..");
const backendDir = resolve(rootDir, "..", "backend");
const playwrightCli = resolve(rootDir, "node_modules", "@playwright", "test", "cli.js");
const isWindows = process.platform === "win32";
const apiBaseUrl = process.env.E2E_API_URL || "http://127.0.0.1:3000";
const appBaseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
const verboseServerLogs = process.env.E2E_VERBOSE_SERVER === "1";
const runnerTimeoutMs = Number.parseInt(
  process.env.E2E_RUNNER_TIMEOUT_MS || String(45 * 60 * 1000),
  10,
);
const playwrightGlobalTimeoutMs = Number.parseInt(
  process.env.E2E_PLAYWRIGHT_GLOBAL_TIMEOUT_MS ||
    String(Math.max(60_000, runnerTimeoutMs - 30_000)),
  10,
);
const maxFailures = process.env.E2E_MAX_FAILURES || "1";
const serverStartupTimeoutMs = Number.parseInt(
  process.env.E2E_SERVER_TIMEOUT_MS || "180000",
  10,
);

const env = {
  ...process.env,
  APP_BASE_URL: appBaseUrl,
  FRONTEND_URL: appBaseUrl,
  NEXT_PUBLIC_API_URL: apiBaseUrl,
  E2E_API_URL: apiBaseUrl,
  E2E_BASE_URL: appBaseUrl,
  E2E_SKIP_WEBSERVER: "1",
  THROTTLE_LIMIT: process.env.E2E_THROTTLE_LIMIT || "10000",
};

const children = [];
let cleanupStarted = false;
let timedOut = false;

function pipeOutput(child, label) {
  child.stdout?.on("data", (chunk) => {
    if (verboseServerLogs) {
      process.stdout.write(`[${label}] ${chunk}`);
    }
  });
  child.stderr?.on("data", (chunk) => {
    if (verboseServerLogs) {
      process.stderr.write(`[${label}] ${chunk}`);
    }
  });
}

function startShellProcess(commandLine, cwd, label) {
  console.log(`[e2e] iniciando ${label}: ${commandLine}`);
  const child = spawn(
    isWindows ? "cmd.exe" : "sh",
    isWindows ? ["/d", "/s", "/c", commandLine] : ["-c", commandLine],
    {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    },
  );
  children.push(child);
  pipeOutput(child, label);
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${label}] saiu com codigo ${code}${signal ? ` (${signal})` : ""}`);
    }
  });
  return child;
}

function runShellCommand(commandLine, cwd, label) {
  console.log(`[e2e] validando ${label}: ${commandLine}`);
  const result = spawnSync(
    isWindows ? "cmd.exe" : "sh",
    isWindows ? ["/d", "/s", "/c", commandLine] : ["-c", commandLine],
    {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `${label} falhou com codigo ${result.status ?? "desconhecido"}.`,
    );
  }
}

function safePlaywrightArg(arg) {
  if (!/^[a-zA-Z0-9_.:/\\=@-]+$/.test(arg)) {
    throw new Error(`Argumento Playwright nao suportado pelo runner E2E: ${arg}`);
  }
  return arg;
}

function killTree(child) {
  if (!child?.pid) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // Process may have already exited.
  }
}

function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  for (const child of children.reverse()) {
    killTree(child);
  }
}

function hasOption(args, option) {
  return args.some((arg) => arg === option || arg.startsWith(`${option}=`));
}

function withDefaultPlaywrightArgs(args) {
  const normalized = [...args];
  if (!hasOption(normalized, "--workers")) {
    normalized.push("--workers=1");
  }
  if (!hasOption(normalized, "--global-timeout")) {
    normalized.push(`--global-timeout=${playwrightGlobalTimeoutMs}`);
  }
  if (maxFailures !== "0" && !hasOption(normalized, "--max-failures")) {
    normalized.push(`--max-failures=${maxFailures}`);
  }
  return normalized;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForUrl(url, label, timeoutMs = serverStartupTimeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        console.log(`[e2e] ${label} pronto em ${url}`);
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await sleep(1000);
  }
  throw new Error(`${label} nao respondeu em ${url}`);
}

async function runPlaywright(args) {
  return new Promise((resolveRun) => {
    const specs = args.filter((arg) => !arg.startsWith("-"));
    const safeArgs = withDefaultPlaywrightArgs(args).map(safePlaywrightArg);
    console.log(
      `[e2e] executando ${specs.length ? specs.join(", ") : "suite completa"}`,
    );
    console.log(`[e2e] timeout total do runner: ${runnerTimeoutMs}ms`);
    console.log(`[e2e] argumentos Playwright: ${safeArgs.join(" ")}`);
    const child = spawn("node", [playwrightCli, "test", ...safeArgs], {
      cwd: rootDir,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    children.push(child);
    child.on("exit", (code) => resolveRun(code ?? 1));
  });
}

async function main() {
  const timeout = setTimeout(() => {
    timedOut = true;
    console.error(
      `[e2e] timeout global atingido (${runnerTimeoutMs}ms). Encerrando processos filhos.`,
    );
    cleanup();
    process.exit(124);
  }, runnerTimeoutMs);

  runShellCommand("npm run db:preflight", backendDir, "banco de dados");

  startShellProcess("npm run start", backendDir, "backend");
  startShellProcess("npm run dev", rootDir, "frontend");

  await waitForUrl(`${apiBaseUrl}/health`, "Backend");
  await waitForUrl(appBaseUrl, "Frontend");

  const code = await runPlaywright(process.argv.slice(2));
  clearTimeout(timeout);
  process.exitCode = timedOut ? 124 : code;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
    process.exit(process.exitCode ?? 0);
  });
