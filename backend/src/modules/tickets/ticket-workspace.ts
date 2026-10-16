import { TicketStatus } from '@prisma/client';

export const TICKET_COLUMNS = {
  NEW: {
    label: 'Entrada e triagem',
    statuses: [TicketStatus.OPEN, TicketStatus.TRIAGE],
  },
  IN_PROGRESS: {
    label: 'Em atendimento',
    statuses: [TicketStatus.IN_PROGRESS],
  },
  WAITING: {
    label: 'Aguardando retorno',
    statuses: [TicketStatus.WAITING_CUSTOMER, TicketStatus.WAITING_INTERNAL],
  },
  SCHEDULED: { label: 'Programados', statuses: [TicketStatus.SCHEDULED] },
  ORDER: {
    label: 'Encaminhados para O.S.',
    statuses: [
      TicketStatus.CONVERTING_TO_ORDER,
      TicketStatus.CONVERTED_TO_ORDER,
    ],
  },
  DONE: {
    label: 'Finalizados',
    statuses: [
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
      TicketStatus.CANCELED,
    ],
  },
} satisfies Record<string, { label: string; statuses: TicketStatus[] }>;

export const TICKET_STATUS_NAMES: Record<TicketStatus, string> = {
  OPEN: 'Aberto',
  TRIAGE: 'Triagem',
  WAITING_CUSTOMER: 'Aguardando cliente',
  WAITING_INTERNAL: 'Aguardando equipe',
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'Em atendimento',
  CONVERTING_TO_ORDER: 'Convertendo em O.S.',
  CONVERTED_TO_ORDER: 'Convertido em O.S.',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
  CANCELED: 'Cancelado',
};
export const TICKET_PRIORITY_NAMES = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};
