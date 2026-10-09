import {
  MaintenanceOrderType,
  Prisma,
  ProposalStatus,
  ProposalType,
} from '@prisma/client';

/** Called inside the business transaction so a failed transition cannot leave a post behind. */
export async function publishProposalWon(
  tx: Prisma.TransactionClient,
  proposalId: string,
) {
  const proposal = await tx.proposal.findUnique({
    where: { id: proposalId },
    select: {
      code: true,
      status: true,
      type: true,
      client: { select: { companyName: true } },
      user: { select: { name: true } },
    },
  });
  if (!proposal || proposal.status !== ProposalStatus.WON) return;
  const subject =
    proposal.type === ProposalType.CONTRACT
      ? 'um contrato'
      : proposal.type === ProposalType.GENERATOR_SALE
        ? 'uma venda de gerador'
        : 'uma proposta comercial';
  await tx.teamPost.upsert({
    where: { eventKey: `proposal-won:${proposalId}` },
    create: {
      category: 'COMMERCIAL',
      eventKey: `proposal-won:${proposalId}`,
      authorName: 'Equipe Manitec',
      body: `⚡ ${proposal.user.name} fechou ${subject} com ${proposal.client.companyName} (proposta ${proposal.code})! Parabéns pela conquista! Seguimos levando energia e confiança a cada cliente.`,
    },
    update: {},
  });
}

export async function publishOrderCompleted(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.maintenanceOrder.findUnique({
    where: { id: orderId },
    select: {
      title: true,
      type: true,
      status: true,
      generator: {
        select: { name: true, client: { select: { companyName: true } } },
      },
      technician: { select: { user: { select: { name: true } } } },
      workSessions: { select: { user: { select: { name: true } } } },
    },
  });
  if (!order || order.status !== 'COMPLETED') return;
  const names = [
    ...new Set(
      [
        order.technician?.user.name,
        ...order.workSessions.map((session) => session.user.name),
      ].filter((name): name is string => Boolean(name)),
    ),
  ];
  const technicians = names.length ? names.join(', ') : 'a equipe técnica';
  const installation = order.type === MaintenanceOrderType.INSTALLATION;
  const serviceSubject =
    names.length > 1
      ? `Nossos técnicos ${technicians} finalizaram`
      : names.length === 1
        ? `Nosso técnico ${technicians} finalizou`
        : 'Nossa equipe técnica finalizou';
  const installationTeam = names.length ? ` e aos técnicos ${technicians}` : '';
  await tx.teamPost.upsert({
    where: { eventKey: `order-completed:${orderId}` },
    create: {
      category: installation ? 'WORKS' : 'SERVICES',
      eventKey: `order-completed:${orderId}`,
      authorName: 'Equipe Manitec',
      body: installation
        ? `⚡ Instalação do gerador ${order.generator.name} finalizada no cliente ${order.generator.client.companyName}! Parabéns ao time${installationTeam}. Juntos, entregamos energia com qualidade!`
        : `🔧 ${serviceSubject} a tarefa "${order.title}" no cliente ${order.generator.client.companyName}. Parabéns pelo trabalho e pela dedicação!`,
    },
    update: {},
  });
}
