#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) args[arg.slice(2)] = true;
      else args[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return args;
}

const args = parseArgs();
const format = (args.format || 'json').toLowerCase();
const outPath = args.out;

const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      department: true,
      branch: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });

  if (format === 'csv') {
    const header = Object.keys(users[0] || {}).join(',');
    const rows = users.map(u =>
      Object.values(u)
        .map(v => (v === null || v === undefined ? '' : String(v)))
        .map(v => '"' + v.replace(/"/g, '""') + '"')
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    if (outPath) fs.writeFileSync(outPath, csv);
    else console.log(csv);
  } else {
    const json = JSON.stringify(users, null, 2);
    if (outPath) fs.writeFileSync(outPath, json);
    else console.log(json);
  }

  await prisma.$disconnect();
})().catch(err => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
