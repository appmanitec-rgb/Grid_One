import { UserRole } from '@prisma/client';
import { ACCESS_SCREENS, type ScreenKey } from '../auth/rules/access-screens';
import {
  ORDER_TYPES,
  type DetailedAccessRules,
} from '../auth/rules/access-rules';
import { defaultAccessPolicyByRole, type AccessPolicy } from './access-policy';

export const ACCESS_PROFILE_IDS = [
  'SUPPLIES',
  'PURCHASING',
  'HR',
  'FINANCE',
  'TECHNICIAN',
  'PLANNING',
  'ADMIN_ASSISTANT',
] as const;
export type AccessProfileId = (typeof ACCESS_PROFILE_IDS)[number];
export type UserAccessProfile = {
  id: AccessProfileId;
  label: string;
  description: string;
  role: UserRole;
  department: string;
  approvalDiscountLimit: number;
  accessPolicy: AccessPolicy;
  accessRules: DetailedAccessRules;
};
type Definition = {
  id: AccessProfileId;
  label: string;
  description: string;
  role: UserRole;
  department: string;
  screens: Partial<Record<ScreenKey, string[]>>;
  orderTypes?: readonly string[];
};
const common = {
  purchaseRequests: ['request'],
  dashboard: [],
  team: ['create', 'update'],
  notifications: [],
};
const definitions: Definition[] = [
  {
    id: 'SUPPLIES',
    label: 'Suprimentos',
    role: UserRole.SUPPLIES,
    department: 'Suprimentos',
    description:
      'Catálogo, estoque, reservas e recebimento de compras. Consulta fornecedores e ordens para organizar os materiais.',
    screens: {
      ...common,
      purchaseRequests: ['request', 'update', 'analyze'],
      catalog: ['create', 'update', 'manageItems', 'viewCosts'],
      inventory: ['create', 'update', 'reserve', 'consume', 'adjust'],
      purchases: ['receive'],
      suppliers: [],
      orders: [],
      equipments: [],
      clients: [],
    },
  },
  {
    id: 'PURCHASING',
    label: 'Compras',
    role: UserRole.SUPPLIES,
    department: 'Compras',
    description:
      'Fornecedores, cotações e pedidos de compra. Aprovação e recebimento ficam com os responsáveis por essas etapas.',
    screens: {
      ...common,
      suppliers: ['create', 'update'],
      purchaseRequests: ['request', 'update', 'analyze'],
      purchaseQuotations: ['quote', 'selectOffer', 'generate'],
      purchases: ['create', 'update', 'cancel', 'send'],
      catalog: ['create', 'update', 'manageItems', 'viewCosts'],
      inventory: [],
    },
  },
  {
    id: 'HR',
    label: 'RH',
    role: UserRole.HR,
    department: 'Recursos Humanos',
    description:
      'Colaboradores, documentação, certificações, ponto, ferramentas, comissões e frota. A segurança dos acessos permanece com a administração.',
    screens: {
      ...common,
      hrCollaborators: ['create', 'update', 'viewSensitive', 'manageSensitive'],
      hrDocumentation: [
        'create',
        'update',
        'manageCertifications',
        'manageSpecialties',
      ],
      hrTools: ['create', 'update'],
      hrTime: ['create', 'update'],
      hrCommissions: ['create', 'update'],
      hrFleet: ['create', 'update'],
      usersControl: ['manage'],
    },
  },
  {
    id: 'FINANCE',
    label: 'Financeiro',
    role: UserRole.FINANCE,
    department: 'Financeiro',
    description:
      'Contas a pagar e receber, cobranças, pagamentos, faturamento, fluxo de caixa e conciliação bancária.',
    screens: {
      ...common,
      purchases: ['validateInvoice'],
      receivables: ['create', 'update', 'pay', 'cancel'],
      payables: ['create', 'update', 'pay', 'cancel'],
      collections: ['create', 'update'],
      fiscalDocuments: ['create', 'update', 'cancel'],
      cashFlow: [],
      bankMovements: ['create', 'update', 'reconcile'],
      reconciliation: ['reconcile'],
      bankAccounts: ['create', 'update'],
      costCenters: ['create', 'update'],
      billing: ['create', 'update', 'pay', 'cancel'],
      costs: [],
      clients: [],
      suppliers: [],
      catalog: ['viewCosts'],
      orders: [],
      equipments: [],
    },
  },
  {
    id: 'TECHNICIAN',
    label: 'Técnico',
    role: UserRole.TECHNICIAN,
    department: 'Técnico',
    description:
      'Portal técnico, execução das O.S., laudos e chamados próprios. Só abre O.S. emergencial durante o plantão cadastrado por técnico.',
    screens: {
      ...common,
      purchaseRequests: ['request'],
      technicianPortal: ['checkInOut'],
      orders: ['create', 'update', 'finish', 'submitVisitReport'],
      tickets: ['viewOwn', 'create', 'commentOwn'],
      serviceReports: ['create', 'update', 'addEvidence', 'sign'],
      equipments: [],
      clients: [],
      catalog: [],
      inventory: [],
    },
    orderTypes: ['EMERGENCY'],
  },
  {
    id: 'PLANNING',
    label: 'Planejamento',
    role: UserRole.LOGISTICS,
    department: 'Planejamento',
    description:
      'Triagem de chamados, abertura de O.S., programação, distribuição de técnicos e acompanhamento da operação.',
    screens: {
      ...common,
      purchaseRequests: ['request'],
      orders: ['create', 'update', 'dispatch'],
      dispatch: ['schedule', 'dispatch', 'viewLiveLocation'],
      technicians: ['schedule', 'dispatch'],
      monitoring: ['viewLiveLocation'],
      tickets: ['create', 'update', 'assign', 'comment', 'convertToOrder'],
      downtimes: ['create', 'update'],
      warranties: ['create', 'update'],
      clients: [],
      sites: [],
      equipments: [],
      catalog: [],
      inventory: [],
      serviceReports: [],
    },
    orderTypes: ORDER_TYPES,
  },
  {
    id: 'ADMIN_ASSISTANT',
    label: 'Assistente Administrativo',
    role: UserRole.NORMAL,
    department: 'Administração',
    description:
      'Apoio em documentos, ponto e ferramentas do RH e lançamentos a pagar e receber. Sem pagamentos, saldos bancários, dados salariais ou administração de acessos.',
    screens: {
      ...common,
      hrCollaborators: [],
      hrDocumentation: [
        'create',
        'update',
        'manageCertifications',
        'manageSpecialties',
      ],
      hrTools: ['create', 'update'],
      hrTime: ['create', 'update'],
      hrFleet: [],
      receivables: ['create', 'update'],
      payables: ['create', 'update'],
      costCenters: [],
      clients: [],
      suppliers: [],
    },
  },
];
const actionSections: Record<string, keyof AccessPolicy> = {
  manageCertifications: 'users',
  manageSpecialties: 'users',
  viewLiveLocation: 'users',
  submitVisitReport: 'maintenanceOrders',
  approveVisitReport: 'maintenanceOrders',
  assignWithOverride: 'maintenanceOrders',
};

/** Return independent, complete policies: role defaults cannot silently add permissions. */
export function listAccessProfiles(): UserAccessProfile[] {
  return definitions.map((definition) => {
    const accessPolicy = defaultAccessPolicyByRole(UserRole.NORMAL);
    const sections = accessPolicy as unknown as Record<
      string,
      Record<string, boolean>
    >;
    for (const flags of Object.values(sections))
      for (const key of Object.keys(flags)) flags[key] = false;
    const accessRules: DetailedAccessRules = {
      version: 1,
      profileId: definition.id,
      screens: {},
      commercial: { generators: false, partsServices: false, contracts: false },
      orderTypes: Object.fromEntries(
        ORDER_TYPES.map((type) => [
          type,
          definition.orderTypes?.includes(type) ?? false,
        ]),
      ) as DetailedAccessRules['orderTypes'],
      onCallShifts: [],
    };
    for (const [key, actions] of Object.entries(definition.screens)) {
      const screen = ACCESS_SCREENS.find((candidate) => candidate.key === key)!;
      accessPolicy.pages[screen.parent] = true;
      // Own-ticket access must not grant the global ticket list.
      if (
        'view' in sections[screen.section] &&
        !(key === 'tickets' && actions.includes('viewOwn'))
      )
        sections[screen.section].view = true;
      for (const action of actions) {
        const owner = sections[actionSections[action] ?? screen.section];
        if (key === 'team') continue;
        if (!(action in owner))
          throw new Error('Unknown profile permission: ' + key + '.' + action);
        owner[action] = true;
      }
      accessRules.screens[key] = {
        view: true,
        actions: Object.fromEntries(actions.map((action) => [action, true])),
      };
    }
    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      role: definition.role,
      department: definition.department,
      approvalDiscountLimit: 0,
      accessPolicy,
      accessRules,
    };
  });
}
