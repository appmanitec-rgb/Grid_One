const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].trim().replace(/^"|"$/g, '');
  }
}
try {
  // Validate current source even when a previous build is still installed.
  let validator;
  try {
    require.resolve('ts-node/register/transpile-only');
    require('ts-node/register/transpile-only');
    validator = require('../src/config/runtime-environment');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    validator = require('../dist/src/config/runtime-environment');
  }
  const { validateRuntimeEnvironment } = validator;
  const result = validateRuntimeEnvironment();
  console.log(`[env:check] OK. environment=${result.environment}; storage=${result.storage}`);
} catch (error) {
  console.error(`[env:check] FAILED: ${error.message}`);
  process.exit(1);
}
