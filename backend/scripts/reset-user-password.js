const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile();

  const [, , password, ...emails] = process.argv;
  if (!password || emails.length === 0) {
    throw new Error(
      'Uso: node scripts/reset-user-password.js <nova-senha> <email...>',
    );
  }

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, name: true, isActive: true },
    });

    const foundEmails = new Set(users.map((user) => user.email));
    const missingEmails = emails.filter((email) => !foundEmails.has(email));

    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          updated: users.map(({ email, name, isActive }) => ({
            email,
            name,
            wasActive: isActive,
          })),
          missing: missingEmails,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[reset-user-password] FAILED: ${error.message}`);
  process.exit(1);
});
