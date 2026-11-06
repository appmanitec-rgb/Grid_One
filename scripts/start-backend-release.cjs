// A release keeps its generated Prisma client separate from the running version.
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const backend = path.resolve(__dirname, '../backend');
const dist = process.env.MANITEC_BACKEND_DIST;
const client = process.env.MANITEC_PRISMA_CLIENT;
if (!/^dist-release-[a-zA-Z0-9-]+$/.test(dist || '') ||
    !/^runtime-release-[a-zA-Z0-9-]+\/client$/.test(client || '')) {
  throw new Error('Invalid release directories; use scripts/start-server.ps1.');
}
const entry = path.join(backend, dist, 'src/main.js');
const clientPath = path.join(backend, client);
if (!fs.existsSync(entry) || !fs.existsSync(path.join(clientPath, 'index.js'))) {
  throw new Error('Release build or Prisma client is missing.');
}
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  const mapped = request === '@prisma/client' ? clientPath :
    request.startsWith('src/') ? path.join(backend, dist, request) : request;
  return resolve.call(this, mapped, ...args);
};
process.chdir(backend);
require(entry);
