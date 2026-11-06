require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const expectedProfiles = [
  {
    cnpj: '39315244000107',
    purpose: 'PARTS',
    name: 'PIX peças - Manitec Energia Equipamentos',
  },
  {
    cnpj: '24878520000160',
    purpose: 'SERVICES',
    name: 'PIX serviços - Manitec Services Geradores',
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).pathname !== '/gridone_db') {
    throw new Error('Este cadastro exige o banco gridone_db.');
  }

  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      for (const expected of expectedProfiles) {
        const company = await tx.companySettings.findFirst({
          where: { cnpj: expected.cnpj },
          select: { id: true, companyName: true, cnpj: true },
        });
        if (!company?.companyName) {
          throw new Error(`Emitente ${expected.cnpj} não encontrado.`);
        }

        const existing = await tx.proposalPaymentProfile.findFirst({
          where: {
            issuerCompanyId: company.id,
            purpose: expected.purpose,
            method: 'PIX',
          },
        });
        if (existing) {
          console.log(`${expected.purpose}: perfil existente ${existing.id}`);
          continue;
        }

        const profile = await tx.proposalPaymentProfile.create({
          data: {
            issuerCompanyId: company.id,
            name: expected.name,
            purpose: expected.purpose,
            method: 'PIX',
            beneficiary: company.companyName,
            beneficiaryDocument: company.cnpj,
            pixKey: company.cnpj,
            isActive: true,
          },
        });
        console.log(`${expected.purpose}: perfil criado ${profile.id}`);
      }
    });
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
