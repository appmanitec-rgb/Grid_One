CREATE TYPE "ProposalItemKind" AS ENUM (
  'CATALOG_SERVICE',
  'HOURLY_SERVICE',
  'PART_MATERIAL',
  'OTHER'
);

CREATE TYPE "ProposalHourType" AS ENUM (
  'ONE_OFF',
  'CONTRACT',
  'EMERGENCY',
  'TRAVEL',
  'ENGINEERING'
);

CREATE TYPE "ProposalTechnicianType" AS ENUM (
  'JUNIOR_TECHNICIAN',
  'MID_LEVEL_TECHNICIAN',
  'SENIOR_TECHNICIAN',
  'APPLICATION_ENGINEER',
  'SPECIALIST'
);

ALTER TABLE "proposal_items"
  ADD COLUMN "kind" "ProposalItemKind" NOT NULL DEFAULT 'PART_MATERIAL',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "hours" DOUBLE PRECISION,
  ADD COLUMN "discountPercent" DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN "hourType" "ProposalHourType",
  ADD COLUMN "technicianType" "ProposalTechnicianType",
  ALTER COLUMN "catalogItemId" DROP NOT NULL;

ALTER TABLE "proposal_items"
  DROP CONSTRAINT IF EXISTS "proposal_items_catalogItemId_fkey";

ALTER TABLE "proposal_items"
  ADD CONSTRAINT "proposal_items_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "proposal_scope_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "scopeText" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "compatibleOpportunityTypes" "SalesOpportunityType"[] NOT NULL DEFAULT ARRAY[]::"SalesOpportunityType"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "proposal_scope_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposal_scope_templates_active_sortOrder_idx"
  ON "proposal_scope_templates"("active", "sortOrder");

INSERT INTO "proposal_scope_templates"
  ("id", "name", "category", "description", "scopeText", "sortOrder", "tags", "compatibleOpportunityTypes")
VALUES
  ('scope-troca-bateria', 'Troca de bateria', 'Manutencao', 'Substituicao de bateria do grupo gerador.', 'Substituicao da bateria do grupo gerador, incluindo retirada da bateria existente, instalacao da nova bateria, reaperto dos terminais e teste de partida.', 10, ARRAY['bateria','partida'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT','EMERGENCY_CORRECTIVE']::"SalesOpportunityType"[]),
  ('scope-troca-oleo-filtros', 'Troca de oleo e filtros', 'Manutencao', 'Troca de oleo lubrificante e filtros aplicaveis.', 'Execucao de troca de oleo e filtros, contemplando drenagem do oleo usado, substituicao dos filtros aplicaveis, abastecimento com oleo recomendado e verificacao de vazamentos.', 20, ARRAY['tof','oleo','filtros'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT']::"SalesOpportunityType"[]),
  ('scope-troca-vela', 'Troca de vela', 'Manutencao', 'Substituicao de vela de ignicao.', 'Substituicao das velas aplicaveis ao grupo gerador, incluindo inspecao dos cabos, reaperto dos pontos de conexao e teste funcional de partida.', 30, ARRAY['vela','ignicao'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT']::"SalesOpportunityType"[]),
  ('scope-tof', 'TOF', 'Manutencao', 'Troca de oleo e filtros em formato TOF.', 'Execucao de TOF, contemplando troca de oleo, substituicao dos filtros previstos, verificacao de niveis, reapertos basicos e teste operacional apos o servico.', 40, ARRAY['tof'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT']::"SalesOpportunityType"[]),
  ('scope-preventiva-basica', 'Preventiva basica', 'Preventiva', 'Rotina preventiva essencial.', 'Execucao de manutencao preventiva basica, contemplando inspecao visual, verificacao de niveis, limpeza tecnica leve, reapertos essenciais, teste de partida e registro das condicoes operacionais.', 50, ARRAY['preventiva'], ARRAY['MAINTENANCE_CONTRACT','CONTRACT_RENEWAL','FIELD_SERVICE']::"SalesOpportunityType"[]),
  ('scope-preventiva-completa', 'Preventiva completa', 'Preventiva', 'Rotina preventiva ampliada.', 'Execucao de manutencao preventiva completa, incluindo verificacoes mecanicas, eletricas e operacionais, limpeza tecnica, reapertos, testes funcionais, analise de alarmes e registro das recomendacoes tecnicas.', 60, ARRAY['preventiva','completa'], ARRAY['MAINTENANCE_CONTRACT','CONTRACT_RENEWAL','FIELD_SERVICE']::"SalesOpportunityType"[]),
  ('scope-diagnostico-tecnico', 'Diagnostico tecnico', 'Diagnostico', 'Diagnostico tecnico operacional.', 'Realizacao de diagnostico tecnico do grupo gerador, contemplando levantamento de sintomas, verificacoes eletricas e mecanicas, testes funcionais e emissao de recomendacoes para correcao.', 70, ARRAY['diagnostico'], ARRAY['FIELD_SERVICE','EMERGENCY_CORRECTIVE']::"SalesOpportunityType"[]),
  ('scope-teste-carga', 'Teste com carga', 'Teste', 'Teste operacional com carga.', 'Execucao de teste operacional com carga, incluindo preparacao do equipamento, acompanhamento dos parametros eletricos e mecanicos, monitoramento de estabilidade e registro dos resultados.', 80, ARRAY['teste','carga'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT','GENERATOR_SALE']::"SalesOpportunityType"[]),
  ('scope-inspecao-qta', 'Inspecao de QTA', 'Eletrica', 'Inspecao de quadro de transferencia automatica.', 'Inspecao do QTA, contemplando verificacao visual, reaperto de conexoes acessiveis, checagem de comando, simulacao funcional quando aplicavel e registro de nao conformidades.', 90, ARRAY['qta','eletrica'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT','INSTALLATION_RETROFIT']::"SalesOpportunityType"[]),
  ('scope-correcao-vazamento', 'Correcao de vazamento', 'Corretiva', 'Correcao de vazamento identificado.', 'Correcao de vazamento identificado no grupo gerador, incluindo avaliacao do ponto de origem, intervencao tecnica aplicavel, limpeza da area afetada e teste para confirmacao da estanqueidade.', 100, ARRAY['vazamento','corretiva'], ARRAY['FIELD_SERVICE','EMERGENCY_CORRECTIVE']::"SalesOpportunityType"[]),
  ('scope-limpeza-tecnica', 'Limpeza tecnica', 'Manutencao', 'Limpeza tecnica do conjunto.', 'Execucao de limpeza tecnica do grupo gerador e componentes acessiveis, removendo residuos que possam comprometer inspecao, ventilacao, operacao ou identificacao de falhas.', 110, ARRAY['limpeza'], ARRAY['FIELD_SERVICE','MAINTENANCE_CONTRACT']::"SalesOpportunityType"[]);
