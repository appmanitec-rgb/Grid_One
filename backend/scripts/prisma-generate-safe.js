const { spawnSync } = require('child_process');
const path = require('path');

// Invoke the installed CLI directly. A locked Prisma engine must never cause
// this script to stop other applications or unrelated Node processes.
const cli = path.resolve(__dirname, '../node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, 'generate'], {
  stdio: 'inherit',
  windowsHide: true,
  shell: false,
});
if (result.error) console.error('[prisma:generate:safe]', result.error.message);
if (result.status !== 0) {
  console.error(
    '[prisma:generate:safe] Falha na geracao. Se o arquivo estiver em uso, pare somente o backend deste projeto e tente novamente.',
  );
}
process.exit(result.status ?? 1);
