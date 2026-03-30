const { spawnSync } = require('child_process');

function runGenerate() {
  return spawnSync('npx prisma generate', {
    stdio: 'inherit',
    shell: true,
  });
}

function killNodeProcesses() {
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${process.pid} } | Stop-Process -Force"`;
    spawnSync(cmd, { stdio: 'inherit', shell: true });
    return;
  }

  spawnSync(`pkill -f node || true`, { stdio: 'inherit', shell: true });
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // sync sleep for script simplicity
  }
}

function main() {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.warn(
        `[prisma:generate:safe] Attempt ${attempt}/${maxAttempts}: stopping Node processes and retrying...`,
      );
      killNodeProcesses();
      sleep(1200);
    }

    const result = runGenerate();
    if (result.status === 0) {
      console.log(`[prisma:generate:safe] OK on attempt ${attempt}.`);
      return;
    }
  }

  console.error('[prisma:generate:safe] Failed after 3 attempts.');
  process.exit(1);
}

main();
