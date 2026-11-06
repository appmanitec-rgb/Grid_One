import type {
  ScopeActivityDefinition,
  ScopeCatalogProfile,
  ScopeFamily,
  ScopeProcedure,
  ScopeProcedureDefinition,
} from './technical-scope.types';

const SECTIONS = {
  preparation: {
    id: 'PREPARATION',
    title: 'Preparação e segurança',
    order: 10,
  },
  inspections: { id: 'INSPECTIONS', title: 'Inspeções contratadas', order: 20 },
  interventions: {
    id: 'INTERVENTIONS',
    title: 'Intervenções e substituições',
    order: 40,
  },
  adjustments: {
    id: 'ADJUSTMENTS',
    title: 'Ajustes e procedimentos complementares',
    order: 50,
  },
  tests: { id: 'TESTS', title: 'Testes contratados', order: 60 },
  finalization: { id: 'FINALIZATION', title: 'Finalização técnica', order: 80 },
};
const INTERVENTION_SERVICES = [
  'REPLACEMENT',
  'PREVENTIVE',
  'CORRECTIVE',
  'INSTALLATION',
];
const MATERIALS = [
  'OIL',
  'OIL_FILTER',
  'FUEL_FILTER',
  'WATER_SEPARATOR',
  'AIR_FILTER',
  'BATTERY',
  'PREHEATER',
  'BELT',
  'SENSOR',
  'COOLANT',
  'HOSE',
  'COMPONENT',
];

function family(
  code: string,
  name: string,
  kind: 'MATERIAL' | 'SERVICE',
  procedureCodes: string[] = [],
): ScopeFamily {
  return {
    code,
    name,
    version: 1,
    isActive: true,
    definitionJson: { kind, procedureCodes },
  };
}
const preparation: ScopeActivityDefinition = {
  id: 'PREP-SAFETY',
  auxiliary: true,
  section: SECTIONS.preparation,
  text: 'Confirmação das condições de acesso e segurança pertinentes à intervenção, conforme orientações do fabricante e validação do responsável técnico. Partidas, energizações e testes dependem de previsão contratual e autorização aplicável.',
};
const finalization: ScopeActivityDefinition = {
  id: 'FINAL-TECHNICAL-RECORD',
  auxiliary: true,
  section: SECTIONS.finalization,
  text: 'Registro das condições e resultados correspondentes aos serviços contratados e organização da área de intervenção.',
};
const leaks: ScopeActivityDefinition = {
  id: 'VERIFY-INTERVENTION-LEAKS',
  auxiliary: true,
  section: SECTIONS.finalization,
  text: 'Verificação de indícios de vazamento e estanqueidade nos pontos da intervenção, quando aplicável, sem pressupor funcionamento ou testes não contratados.',
};
function procedure(
  code: string,
  name: string,
  section: ScopeProcedureDefinition['section'],
  activities: ScopeActivityDefinition[],
  extra: Partial<ScopeProcedureDefinition> = {},
): ScopeProcedure {
  return {
    code,
    name,
    version: 1,
    isActive: true,
    definitionJson: {
      trigger: 'SERVICE',
      section,
      activities: [preparation, ...activities, finalization],
      ...extra,
    },
  };
}
function materialProcedure(
  code: string,
  name: string,
  materialFamily: string,
  text: string,
  extra: Partial<ScopeProcedureDefinition> = {},
  verifyLeaks = false,
): ScopeProcedure {
  return procedure(
    code,
    name,
    SECTIONS.interventions,
    [{ id: code + '-WORK', text }, ...(verifyLeaks ? [leaks] : [])],
    {
      trigger: 'MATERIAL',
      category: 'REPLACEMENT',
      requiredServiceFamilyCodes: INTERVENTION_SERVICES,
      requiredMaterialFamilyCodes: [materialFamily],
      ...extra,
    },
  );
}
function service(
  code: string,
  name: string,
  serviceFamily: string,
  section: ScopeProcedureDefinition['section'],
  activities: Array<[string, string]>,
  extra: Partial<ScopeProcedureDefinition> = {},
): ScopeProcedure {
  return procedure(
    code,
    name,
    section,
    activities.map(([id, text]) => ({ id, text })),
    {
      category: serviceFamily,
      requiredServiceFamilyCodes: [serviceFamily],
      ...extra,
    },
  );
}

/** Initial library only; commercial catalog mappings must be reviewed and saved explicitly. */
export const DEFAULT_SCOPE_FAMILIES: ScopeFamily[] = [
  family('OIL', 'Óleo lubrificante', 'MATERIAL', ['MAT-OIL-REPLACEMENT']),
  family('OIL_FILTER', 'Filtro de óleo', 'MATERIAL', [
    'MAT-OIL-FILTER-REPLACEMENT',
  ]),
  family('FUEL_FILTER', 'Filtro de combustível', 'MATERIAL', [
    'MAT-FUEL-FILTER-REPLACEMENT',
  ]),
  family('WATER_SEPARATOR', 'Filtro separador de água', 'MATERIAL', [
    'MAT-WATER-SEPARATOR-REPLACEMENT',
  ]),
  family('AIR_FILTER', 'Filtro de ar', 'MATERIAL', [
    'MAT-AIR-FILTER-REPLACEMENT',
  ]),
  family('BATTERY', 'Bateria', 'MATERIAL', ['MAT-BATTERY-REPLACEMENT']),
  family('PREHEATER', 'Pré-aquecedor', 'MATERIAL', [
    'MAT-PREHEATER-REPLACEMENT',
  ]),
  family('BELT', 'Correia', 'MATERIAL', ['MAT-BELT-REPLACEMENT']),
  family('SENSOR', 'Sensor', 'MATERIAL', ['MAT-SENSOR-REPLACEMENT']),
  family('COOLANT', 'Fluido de arrefecimento', 'MATERIAL', [
    'MAT-COOLANT-REPLACEMENT',
  ]),
  family('HOSE', 'Mangueiras', 'MATERIAL', ['MAT-HOSE-REPLACEMENT']),
  family('COMPONENT', 'Componente elétrico ou mecânico', 'MATERIAL', [
    'MAT-COMPONENT-REPLACEMENT',
  ]),
  family('VISUAL_INSPECTION', 'Inspeção visual', 'SERVICE', [
    'SERV-INS-VISUAL',
  ]),
  family('ELECTRICAL_INSPECTION', 'Inspeção elétrica', 'SERVICE', [
    'SERV-INS-ELET',
  ]),
  family('MECHANICAL_INSPECTION', 'Inspeção mecânica', 'SERVICE', [
    'SERV-INS-MEC',
  ]),
  family('ELECTROMECHANICAL_INSPECTION', 'Inspeção eletromecânica', 'SERVICE', [
    'SERV-INS-ELETROMEC',
  ]),
  family('DIAGNOSIS', 'Diagnóstico técnico', 'SERVICE', ['SERV-DIAGNOSIS']),
  family('REPLACEMENT', 'Substituição de componentes', 'SERVICE', [
    'SERV-REPLACEMENT',
  ]),
  family('INSTALLATION', 'Instalação de componentes', 'SERVICE', [
    'SERV-INSTALLATION',
  ]),
  family('PREVENTIVE', 'Manutenção preventiva', 'SERVICE', ['SERV-PREVENTIVE']),
  family('CORRECTIVE', 'Manutenção corretiva', 'SERVICE', ['SERV-CORRECTIVE']),
  family('CLEANING', 'Limpeza técnica', 'SERVICE', ['SERV-CLEANING']),
  family('ADJUSTMENT', 'Ajustes e regulagens', 'SERVICE', ['SERV-ADJUSTMENT']),
  family('FUNCTIONAL_TEST', 'Testes funcionais', 'SERVICE', [
    'SERV-FUNCTIONAL-TEST',
  ]),
  family('NO_LOAD_TEST', 'Teste operacional sem carga', 'SERVICE', [
    'SERV-TEST-NO-LOAD',
  ]),
  family('LOAD_TEST', 'Teste com carga da instalação', 'SERVICE', [
    'SERV-TEST-LOAD',
  ]),
  family('LOAD_BANK_TEST', 'Teste com banco de cargas', 'SERVICE', [
    'SERV-TEST-LOAD-BANK',
  ]),
  family('TRANSFER_TEST', 'Teste de transferência automática', 'SERVICE', [
    'SERV-TEST-TRANSFER',
  ]),
  family('COMMISSIONING', 'Comissionamento', 'SERVICE', ['SERV-COMMISSIONING']),
  family('STARTUP', 'Startup de grupo gerador', 'SERVICE', ['SERV-STARTUP']),
];

export const DEFAULT_SCOPE_PROCEDURES: ScopeProcedure[] = [
  materialProcedure(
    'MAT-OIL-REPLACEMENT',
    'Substituição do óleo lubrificante',
    'OIL',
    'Renovação do óleo lubrificante previsto na proposta, conforme aplicação, quantidade comercial e orientações do fabricante.',
    {},
    true,
  ),
  materialProcedure(
    'MAT-OIL-FILTER-REPLACEMENT',
    'Substituição do filtro de óleo',
    'OIL_FILTER',
    'Substituição do filtro de óleo relacionado na proposta e verificação das condições de fixação e vedação aplicáveis.',
    {},
    true,
  ),
  materialProcedure(
    'MAT-FUEL-FILTER-REPLACEMENT',
    'Substituição do filtro de combustível',
    'FUEL_FILTER',
    'Substituição do filtro de combustível contratado, com escorva ou sangria somente quando aplicável e conforme procedimento validado do fabricante.',
    {},
    true,
  ),
  materialProcedure(
    'MAT-WATER-SEPARATOR-REPLACEMENT',
    'Substituição do separador de água',
    'WATER_SEPARATOR',
    'Substituição do elemento separador de água previsto na proposta e verificação das condições aparentes do conjunto.',
    {},
    true,
  ),
  materialProcedure(
    'MAT-AIR-FILTER-REPLACEMENT',
    'Substituição do filtro de ar',
    'AIR_FILTER',
    'Substituição do elemento filtrante de ar contratado e verificação visual do alojamento e dos pontos de fixação acessíveis.',
  ),
  materialProcedure(
    'MAT-BATTERY-REPLACEMENT',
    'Substituição da bateria',
    'BATTERY',
    'Substituição da bateria expressamente relacionada na proposta, condicionada à compatibilidade elétrica e às condições seguras de intervenção.',
    {
      requirements: [
        {
          code: 'BATTERY_COMPATIBILITY_AND_SAFETY',
          condition: 'SAFETY',
          severity: 'warning',
          message:
            'Validar previamente a compatibilidade da bateria, o acesso seguro e as condições de isolamento e prevenção de partidas inesperadas com o responsável técnico.',
        },
      ],
    },
  ),
  materialProcedure(
    'MAT-PREHEATER-REPLACEMENT',
    'Substituição do pré-aquecedor',
    'PREHEATER',
    'Substituição do pré-aquecedor contratado, conforme compatibilidade elétrica, mecânica e térmica verificada para o equipamento.',
    {
      requirements: [
        {
          code: 'PREHEATER_COMPATIBILITY_AND_SAFETY',
          condition: 'SAFETY',
          severity: 'warning',
          message:
            'Confirmar a aplicação do pré-aquecedor e as condições seguras de acesso, isolamento e temperatura antes da intervenção.',
        },
      ],
    },
    true,
  ),
  materialProcedure(
    'MAT-BELT-REPLACEMENT',
    'Substituição da correia',
    'BELT',
    'Substituição da correia prevista na proposta, com verificação de assentamento, alinhamento e condições aparentes conforme orientações do fabricante.',
  ),
  materialProcedure(
    'MAT-SENSOR-REPLACEMENT',
    'Substituição do sensor',
    'SENSOR',
    'Substituição do sensor contratado e verificação das conexões acessíveis, sem presumir calibração, programação ou testes não previstos.',
  ),
  materialProcedure(
    'MAT-COOLANT-REPLACEMENT',
    'Intervenção no fluido de arrefecimento',
    'COOLANT',
    'Renovação do fluido de arrefecimento previsto na proposta, conforme compatibilidade e quantidade comercial, sem presumir concentração ou capacidade não informadas.',
    {},
    true,
  ),
  materialProcedure(
    'MAT-HOSE-REPLACEMENT',
    'Substituição de mangueiras',
    'HOSE',
    'Substituição das mangueiras expressamente contratadas, com verificação de conexões, fixações e compatibilidade de aplicação.',
    {},
    true,
  ),
  materialProcedure(
    'MAT-COMPONENT-REPLACEMENT',
    'Substituição de componente',
    'COMPONENT',
    'Substituição do componente definido nos itens contratados, condicionada à confirmação da aplicação e do procedimento técnico adequado.',
  ),
  service(
    'SERV-INS-VISUAL',
    'Inspeção visual',
    'VISUAL_INSPECTION',
    SECTIONS.inspections,
    [
      [
        'INS-VISUAL-CONDITION',
        'Avaliação das condições gerais aparentes do grupo gerador e de seus componentes acessíveis.',
      ],
      [
        'INS-VISUAL-ANOMALIES',
        'Verificação visual de indícios de vazamentos, danos e anormalidades, com registro das condições identificadas.',
      ],
    ],
  ),
  service(
    'SERV-INS-ELET',
    'Inspeção elétrica',
    'ELECTRICAL_INSPECTION',
    SECTIONS.inspections,
    [
      [
        'INS-ELECTRICAL-CONNECTIONS',
        'Inspeção visual de conexões elétricas, cabos, terminais e componentes acessíveis abrangidos pelo serviço contratado.',
      ],
      [
        'INS-START-CHARGE',
        'Verificação visual dos sistemas de partida e carregamento, conforme abrangência contratada e condições seguras de acesso.',
      ],
    ],
  ),
  service(
    'SERV-INS-MEC',
    'Inspeção mecânica',
    'MECHANICAL_INSPECTION',
    SECTIONS.inspections,
    [
      [
        'INS-MECHANICAL-CONDITION',
        'Inspeção das condições gerais do motor e dos conjuntos mecânicos acessíveis.',
      ],
      [
        'INS-MECHANICAL-COMPONENTS',
        'Verificação visual de mangueiras, correias, fixações e componentes aparentes, com registro de vazamentos, desgastes e anormalidades observáveis.',
      ],
    ],
  ),
  service(
    'SERV-INS-ELETROMEC',
    'Inspeção eletromecânica',
    'ELECTROMECHANICAL_INSPECTION',
    SECTIONS.inspections,
    [
      [
        'INS-MECHANICAL-CONDITION',
        'Inspeção das condições gerais do motor e dos conjuntos mecânicos acessíveis.',
      ],
      [
        'INS-ELECTRICAL-CONNECTIONS',
        'Inspeção visual de conexões elétricas, cabos, terminais e componentes acessíveis abrangidos pelo serviço contratado.',
      ],
      [
        'INS-START-CHARGE',
        'Verificação visual dos sistemas de partida e carregamento, conforme abrangência contratada e condições seguras de acesso.',
      ],
    ],
  ),
  service(
    'SERV-DIAGNOSIS',
    'Diagnóstico técnico',
    'DIAGNOSIS',
    SECTIONS.inspections,
    [
      [
        'DIAGNOSIS-ASSESSMENT',
        'Avaliação técnica das anormalidades informadas, dentro da abrangência contratada, com registro das constatações e recomendações; reparos e ensaios adicionais dependem de validação.',
      ],
    ],
  ),
  service(
    'SERV-REPLACEMENT',
    'Serviço de substituição',
    'REPLACEMENT',
    SECTIONS.interventions,
    [
      [
        'REPLACEMENT-BOUNDARY',
        'A substituição limita-se aos componentes expressamente relacionados nos itens contratados e aos procedimentos técnicos aplicáveis.',
      ],
    ],
    { requiredMaterialFamilyCodes: MATERIALS },
  ),
  service(
    'SERV-INSTALLATION',
    'Instalação de componentes',
    'INSTALLATION',
    SECTIONS.interventions,
    [
      [
        'INSTALLATION-BOUNDARY',
        'Instalação dos componentes definidos nos itens contratados, conforme compatibilidade e condições técnicas validadas.',
      ],
    ],
    { requiredMaterialFamilyCodes: MATERIALS },
  ),
  service(
    'SERV-PREVENTIVE',
    'Manutenção preventiva',
    'PREVENTIVE',
    SECTIONS.interventions,
    [
      [
        'PREVENTIVE-BOUNDARY',
        'Inspeção visual do grupo gerador para identificar vazamentos, conexões soltas e desgaste aparente, com registro das condições encontradas. Substituições e testes são descritos apenas quando contratados.',
      ],
    ],
  ),
  service(
    'SERV-CORRECTIVE',
    'Manutenção corretiva',
    'CORRECTIVE',
    SECTIONS.interventions,
    [
      [
        'CORRECTIVE-BOUNDARY',
        'Diagnóstico da falha relatada por inspeção e verificação dos componentes envolvidos. O resultado da investigação define a necessidade de reparos; peças, reparos e testes adicionais dependem de contratação específica.',
      ],
    ],
  ),
  service(
    'SERV-CLEANING',
    'Limpeza técnica',
    'CLEANING',
    SECTIONS.adjustments,
    [
      [
        'CLEANING-ACCESSIBLE',
        'Limpeza técnica dos pontos acessíveis contemplados no serviço contratado, conforme compatibilidade e cuidados recomendados pelo fabricante.',
      ],
    ],
  ),
  service(
    'SERV-ADJUSTMENT',
    'Ajustes e regulagens',
    'ADJUSTMENT',
    SECTIONS.adjustments,
    [
      [
        'ADJUSTMENT-CONTRACTED',
        'Ajustes e regulagens expressamente previstos no serviço contratado, condicionados aos limites técnicos e às recomendações do fabricante.',
      ],
    ],
  ),
  service(
    'SERV-FUNCTIONAL-TEST',
    'Testes funcionais',
    'FUNCTIONAL_TEST',
    SECTIONS.tests,
    [
      [
        'TEST-FUNCTIONAL-CONTRACTED',
        'Verificações funcionais dos pontos definidos no serviço contratado, sem pressupor ensaio com carga, transferência ou condições operacionais não autorizadas.',
      ],
    ],
  ),
  service(
    'SERV-TEST-NO-LOAD',
    'Teste operacional sem carga',
    'NO_LOAD_TEST',
    SECTIONS.tests,
    [
      [
        'TEST-NO-LOAD',
        'Funcionamento do grupo gerador sem aplicação de carga elétrica externa, após validação das condições de segurança e autorização aplicável.',
      ],
      [
        'TEST-NO-LOAD-PARAMETERS',
        'Verificação dos parâmetros elétricos e mecânicos pertinentes, alarmes e anormalidades observáveis, com registro dos resultados.',
      ],
    ],
    {
      requirements: [
        {
          code: 'NO_LOAD_START_AUTHORIZATION',
          condition: 'CLIENT_PENDING',
          severity: 'warning',
          message:
            'Confirmar a autorização para partida e as condições de segurança antes do teste sem carga.',
        },
      ],
    },
  ),
  service(
    'SERV-TEST-LOAD',
    'Teste com carga da instalação',
    'LOAD_TEST',
    SECTIONS.tests,
    [
      [
        'TEST-INSTALLATION-LOAD',
        'Realização de teste operacional com carga disponível na instalação, conforme condições técnicas e operacionais e mediante autorização prévia do responsável.',
      ],
    ],
    { loadMode: 'INSTALLATION', requiresOperationalAuthorization: true },
  ),
  service(
    'SERV-TEST-LOAD-BANK',
    'Teste com banco de cargas',
    'LOAD_BANK_TEST',
    SECTIONS.tests,
    [
      [
        'TEST-LOAD-BANK',
        'Teste com banco de cargas somente nas condições de uso e disponibilização expressamente contratadas, após validação técnica e autorização prévia.',
      ],
    ],
    { loadMode: 'LOAD_BANK', requiresOperationalAuthorization: true },
  ),
  service(
    'SERV-TEST-TRANSFER',
    'Teste de transferência automática',
    'TRANSFER_TEST',
    SECTIONS.tests,
    [
      [
        'TEST-AUTOMATIC-TRANSFER',
        'Verificação da função de transferência automática conforme condições expressamente contratadas e autorizadas, sem presumir interrupção, percentual ou transferência efetiva de carga.',
      ],
    ],
    { requiresOperationalAuthorization: true },
  ),
  service(
    'SERV-COMMISSIONING',
    'Comissionamento',
    'COMMISSIONING',
    SECTIONS.interventions,
    [
      [
        'COMMISSIONING-CONFORMITY',
        'Verificação de conformidade da instalação e dos pontos definidos no comissionamento contratado, com registro de pendências. Energização e ensaios adicionais exigem previsão e autorização aplicáveis.',
      ],
    ],
  ),
  service(
    'SERV-STARTUP',
    'Startup de grupo gerador',
    'STARTUP',
    SECTIONS.interventions,
    [
      [
        'STARTUP-CONTRACTED',
        'Partida inicial e acompanhamento dos parâmetros disponíveis conforme condições técnicas previamente verificadas e abrangência do serviço contratado.',
      ],
    ],
    {
      requirements: [
        {
          code: 'STARTUP_AUTHORIZATION',
          condition: 'CLIENT_PENDING',
          severity: 'warning',
          message:
            'Confirmar previamente a autorização operacional, a disponibilidade da instalação e as condições técnicas para a partida inicial.',
        },
      ],
    },
  ),
];

export const DEFAULT_SCOPE_CATALOG_PROFILES: ScopeCatalogProfile[] = [];
