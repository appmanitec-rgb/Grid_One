# Ciclo 20G-A - Oportunidades

## Resumo executivo

O bloco 20G-A revisou a aba Oportunidades para corrigir o problema operacional de listas grandes em campos relacionais e preparar a segmentacao comercial por linha de venda.

O fluxo de Oportunidades agora usa pesquisa para cliente e vendedor, permite cadastro rapido de cliente e registra `pipeline` e `opportunityType` no banco. A validacao critica ficou no backend: vendedor informado em `assignedSellerId` precisa ser usuario ativo com `role = SALES` e compativel com o pipeline comercial.

## Alteracoes realizadas

- Adicionado lookup de clientes em `GET /clients/lookup`, com retorno minimo e limite maximo de 20 resultados.
- Campo Cliente da tela de Oportunidades deixou de depender de lista completa e passou a usar pesquisa.
- Adicionado cadastro rapido de cliente na tela de Oportunidades.
- Cliente criado pelo cadastro rapido passa a ficar selecionado na nova oportunidade.
- Adicionado lookup de vendedores em `GET /crm/sellers`, com filtro por usuarios comerciais ativos.
- Backend passou a validar `assignedSellerId` como vendedor comercial ativo antes de criar ou atualizar oportunidade.
- Adicionados `pipeline` e `opportunityType` em `SalesOpportunity`.
- Tela de Oportunidades passou a exibir filtro por pipeline, campo de pipeline e campo de tipo de oportunidade.
- Tipos de oportunidade sao restringidos conforme o pipeline escolhido.

## Pipeline e tipos

Pipelines adicionados:

- `COMMERCIAL_01_GENERATORS`: Comercial 01 - Geradores.
- `COMMERCIAL_02_CONTRACTS`: Comercial 02 - Contratos.
- `COMMERCIAL_03_PARTS_SERVICES`: Comercial 03 - Pecas e Servicos.

Tipos adicionados:

- `GENERATOR_SALE`
- `GENERATOR_RENTAL`
- `INSTALLATION_RETROFIT`
- `MAINTENANCE_CONTRACT`
- `CONTRACT_RENEWAL`
- `CONTRACT_EXPANSION`
- `PARTS_SALE`
- `FIELD_SERVICE`
- `EMERGENCY_CORRECTIVE`
- `OTHER`

## Arquivos principais

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260727163000_ciclo_20g_opportunity_pipeline_type/migration.sql`
- `backend/src/modules/clients/clients.controller.ts`
- `backend/src/modules/clients/clients.service.ts`
- `backend/src/modules/crm/crm.controller.ts`
- `backend/src/modules/crm/crm.service.ts`
- `backend/src/modules/crm/dto/crm.dto.ts`
- `frontend/app/dashboard/opportunities/page.tsx`
- `frontend/e2e/commercial-contract-finance.spec.ts`

## Testes e validacoes

- `npm test -- --runInBand crm.service.spec.ts clients.service.spec.ts`: passou, 2 suites / 8 testes.
- Backend `npm run lint`: passou.
- Backend `npm run build`: passou.
- Backend `npm test -- --runInBand`: passou, 36 suites / 206 testes.
- `npx prisma migrate status`: passou, banco atualizado com 46 migrations.
- Frontend `npm run lint`: passou.
- Frontend `npm run build`: passou com rede liberada para o Next baixar Google Fonts.
- Frontend `npm run e2e -- e2e/commercial-contract-finance.spec.ts`: passou, 2 testes.
- `git diff --check`: passou, apenas avisos CRLF/LF do Windows.

## Observacoes

- O primeiro E2E falhou porque o banco estava sem massa `seed:flow` apos limpeza de dados. Foi executado `SEED_DEMO_PASSWORD=Demo@123456 npm run seed:flow` localmente, sem gravar segredo em arquivo.
- O E2E tambem revelou que o spec usava o usuario admin como vendedor da oportunidade. O teste foi corrigido para usar `accounts.sales`, preservando o admin como operador da API.
- `backend/backups/` foi removido do caminho de commit e o arquivo foi movido para `manual-backups`.
- Templates DOCX/documentos existentes foram preservados, pois fazem parte da evolucao institucional de documentos.

## Fora do escopo deste bloco

- Propostas ainda nao receberam pipeline comercial separado.
- Contratos nao foram alterados.
- Financeiro nao foi alterado.
- PDF/documentos nao foram alterados neste bloco.
- Portal nao foi alterado.

## Proxima recomendacao

Seguir para `20G-B - Propostas`, propagando a segmentacao comercial para a criacao/listagem de propostas sem misturar com o funil por status que ja existe.
