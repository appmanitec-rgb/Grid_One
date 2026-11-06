const { spawnSync } = require('node:child_process');
const path = require('node:path');

const section = process.argv[2];
if (!['backend', 'frontend'].includes(section)) throw new Error('Use backend ou frontend.');
const result = spawnSync(
  process.platform === 'win32' ? 'cmd.exe' : 'npm',
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm audit --omit=dev --json']
    : ['audit', '--omit=dev', '--json'],
  { cwd: path.resolve(__dirname, '..', section), encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
);
let report;
try { report = JSON.parse(result.stdout); } catch {
  console.error('[security:check] Auditoria indisponivel; verifique acesso ao registro npm.');
  process.exit(1);
}
if (report.error || !report.metadata || ![0, 1].includes(result.status)) {
  console.error('[security:check] Auditoria incompleta.');
  process.exit(1);
}
let blocking = 0;
for (const [name, item] of Object.entries(report.vulnerabilities || {})) {
  // Exact documented exception: A1 parser, outside current release scope.
  // No RSA signature-verification call exists in application code.
  const excludedA1 = section === 'backend' && name === 'node-forge' &&
    item.via.every(advisory => typeof advisory === 'object' &&
      advisory.url === 'https://github.com/advisories/GHSA-86w9-cpqp-85rv');
  if (excludedA1) {
    console.warn('[security:check] EXCECAO registrada: node-forge / A1; veja docs/revisao-prontidao-2026-10-13.md.');
    continue;
  }
  console.error(`[security:check] ${item.severity}: ${name}`);
  blocking++;
}
console.log(`[security:check] ${section}: ${blocking} alerta(s) de execucao sem tratamento.`);
process.exit(blocking ? 1 : 0);
