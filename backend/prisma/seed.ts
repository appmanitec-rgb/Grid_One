import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is required for seed.`);
  }
  return value;
}

async function main() {
  const adminName = process.env.SEED_ADMIN_NAME || 'Admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@manitec.local';
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');

  const masterName = process.env.SEED_MASTER_NAME || 'MANITEC';
  const masterEmail = process.env.SEED_MASTER_EMAIL || 'master@manitec.local';
  const masterPassword = requireEnv('SEED_MASTER_PASSWORD');

  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const masterPasswordHash = await bcrypt.hash(masterPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      role: UserRole.ADMIN,
      isActive: true,
      isSystemMaster: false,
      passwordHash: adminPasswordHash,
    },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      isActive: true,
      isSystemMaster: false,
    },
  });

  await prisma.user.upsert({
    where: { email: masterEmail },
    update: {
      name: masterName,
      role: UserRole.ADMIN,
      isActive: true,
      isSystemMaster: true,
      passwordHash: masterPasswordHash,
    },
    create: {
      name: masterName,
      email: masterEmail,
      passwordHash: masterPasswordHash,
      role: UserRole.ADMIN,
      isActive: true,
      isSystemMaster: true,
    },
  });

  console.log(`[seed] Admin ready: ${adminEmail}`);
  console.log(`[seed] Master ready: ${masterEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

