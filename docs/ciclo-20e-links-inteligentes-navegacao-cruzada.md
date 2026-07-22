# Ciclo 20E - Links inteligentes globais e navegacao cruzada

Base inicial: `1ecc051 feat: ciclo 20d estoque operacional rastreabilidade`

## 1. Resumo executivo

O Ciclo 20E atacou a navegacao operacional entre entidades centrais do ERP sem alterar PDF, financeiro pesado, staging, multitenancy ou reorganizacao completa de Pessoas/Agentes.

O objetivo foi reduzir telas isoladas e transformar os detalhes de cliente, equipamento, OS, chamado, proposta, contrato, laudo e item de catalogo em pontos de navegacao cruzada. As acoes e links sensiveis passaram a usar um padrao unico no frontend, com checagem de permissao e acesso de rota antes de renderizar link navegavel.

Tambem houve reforco no backend para expor referencias operacionais seguras em `GET /clients/:id` e incluir o laudo relacionado em `MaintenanceOrder`, alem de mascarar `unitCost` de materiais de OS para perfis sem visibilidade de custo operacional.

## 2. Escopo implementado

- Componente compartilhado de navegacao operacional:
  - `PermissionAwareLink`
  - `OperationalBreadcrumb`
  - `EntityBadge`
  - `QuickActions`
  - `RelatedEntityCard`
  - `RelatedEntityGrid`
- Breadcrumb operacional em telas de detalhe.
- Mapa de relacionamentos em Cliente, Proposta, Contrato e Laudo.
- Links permission-aware em Equipamento, OS, Chamado, Catalogo e tela tecnica de campo.
- Enriquecimento seguro de cliente com OS, chamados e laudos relacionados.
- Inclusao do laudo relacionado na resposta de OS.
- Mascaramento backend de `MaintenanceOrderMaterial.unitCost` para perfis sem visibilidade de custo.
- Testes unitarios de cliente e OS.
- E2E especifico de navegacao inteligente.

## 3. Fora do escopo confirmado

- PDF e motor de templates.
- Financeiro pesado, ledger, conciliacao e DRE.
- Staging, observabilidade externa e homologacao real.
- Multitenancy.
- Reorganizacao completa de Pessoas/Agentes.
- Site/Local rico.
- Historico versionado de ficha tecnica.
- Estoque completo alem dos links ja existentes do 20D.
- Nova migration.

## 4. Auditoria inicial

Comandos iniciais executados:
- `git status --short`: havia arvore limpa antes das alteracoes.
- `git log --oneline -10`: confirmou `1ecc051` como base do 20D.
- `git diff --stat`: sem diff antes do inicio.

Mapa auditado:

| Area | Evidencia | Situacao antes do 20E | Decisao |
| --- | --- | --- | --- |
| Clientes | `frontend/app/dashboard/clients/[id]/page.tsx` | Tinha equipamentos, propostas e contratos, mas nao tinha mapa unico de OS, chamados e laudos. | Ajustado. |
| Equipamentos | `frontend/app/dashboard/equipments/[id]/page.tsx` | Tinha links do 20C, mas nao padrao global/breadcrumb. | Ajustado. |
| OS | `frontend/app/dashboard/orders/[id]/page.tsx` | Tinha contexto operacional, mas faltava laudo relacionado e protecao visual/backend de custo. | Ajustado. |
| Chamados | `frontend/app/dashboard/atendimento/[id]/page.tsx` | Tinha cliente/equipamento/OS, mas sem breadcrumb e sem padrao global. | Ajustado. |
| Propostas | `frontend/app/dashboard/proposals/[id]/page.tsx` | Links dispersos para origem CRM, contrato e documento. | Ajustado. |
| Contratos | `frontend/app/dashboard/contracts/[id]/page.tsx` | Relacoes existiam, mas sem mapa unico de cliente/proposta/equipamentos/OS/financeiro. | Ajustado. |
| Laudos | `frontend/app/dashboard/relatorios-tecnicos/[id]/page.tsx` | Foco documental, sem grade consolidada de relacoes operacionais. | Ajustado. |
| Estoque | `frontend/app/dashboard/catalog/[id]/page.tsx` | Rastreabilidade do 20D existia, mas o cabecalho nao usava breadcrumb/padrao global. | Ajustado apenas no detalhe de item. |
| Compras | `frontend/app/dashboard/purchase-orders/page.tsx` | Ja existiam links para fornecedor e item de catalogo. | Auditado; sem refatorar compras neste ciclo. |
| Fornecedores | `frontend/app/dashboard/suppliers/[id]/page.tsx` | Ja existia link para catalogo nos itens fornecidos. | Auditado; sem refatorar fornecedores neste ciclo. |
| Financeiro leve/AR | `frontend/app/dashboard/finance/accounts-receivable/page.tsx` | AR ja tinha links para contrato e OS; financeiro pesado ficou fora do escopo. | Auditado; sem refatorar financeiro. |
| Portal do Cliente | `frontend/app/portal/**` | Portal usa rotas `/portal` e links escopados ao proprio cliente. | Mantido isolado; E2E valida URL interna. |
| Area do Tecnico | `frontend/app/dashboard/tecnico/ordens/[id]/page.tsx` | Tela de campo era enxuta, sem links internos amplos. | Breadcrumb limitado; sem financeiro/contratos. |

Riscos encontrados:
- Algumas telas usavam `Link` direto, sem checagem compartilhada de permissao.
- Algumas entidades exibiam texto/relacao sem navegacao clara.
- Cliente tinha relacoes no banco que nao chegavam consolidadas ao detalhe.
- OS podia exibir custo de material se o payload trouxesse `unitCost`, exigindo reforco backend.

## 5. Telas auditadas e ajustadas

### Cliente

Arquivo: `frontend/app/dashboard/clients/[id]/page.tsx`

Achados antes do ajuste:
- Cliente ja tinha equipamentos, contratos e propostas, mas nao apresentava um mapa operacional unico com OS, chamados e laudos.
- Acoes rapidas eram links diretos sem um componente compartilhado de permissao.

Ajustes:
- Adicionado breadcrumb operacional.
- Adicionado bloco `QuickActions` com permissoes:
  - `clients.update`
  - `proposals.create`
  - `equipments.create`
  - `tickets.view`
  - `orders.view`
  - `contracts.view`
- Adicionado `RelatedEntityGrid` com equipamentos, contratos, OS, chamados e laudos.
- Links de equipamento, contrato e proposta passaram por `PermissionAwareLink`.

### Equipamento

Arquivo: `frontend/app/dashboard/equipments/[id]/page.tsx`

Achados antes do ajuste:
- O 20C ja havia enriquecido a ficha tecnica e links locais, mas a tela ainda nao usava breadcrumb/padrao global.

Ajustes:
- Adicionado breadcrumb operacional.
- Links de cliente, local, contrato, OS, laudos, chamados e catalogo passaram por `PermissionAwareLink`.
- Acoes do cabecalho respeitam `clients.view`, `contracts.view` e demais permissoes relacionadas.

### Ordem de servico

Arquivo: `frontend/app/dashboard/orders/[id]/page.tsx`

Achados antes do ajuste:
- A OS tinha contexto operacional, mas nao trazia link direto para laudo relacionado.
- Custo reservado e custo unitario de material podiam aparecer no frontend se a resposta da API trouxesse dados.

Ajustes:
- Adicionado breadcrumb operacional.
- Adicionado link para laudo quando a OS possui `serviceReport`.
- Links de cliente, equipamento, contrato e catalogo passaram por `PermissionAwareLink`.
- Campo visual de custo fica como `Restrito` sem `catalog.viewCosts`.
- Backend tambem mascara `unitCost` para perfis sem acesso a custo.

### Chamado / Atendimento

Arquivo: `frontend/app/dashboard/atendimento/[id]/page.tsx`

Achados antes do ajuste:
- Chamado tinha contexto basico, mas sem breadcrumb global.

Ajustes:
- Adicionado breadcrumb operacional.
- Links de cliente, equipamento, contrato e OS passaram por `PermissionAwareLink`.

### Proposta

Arquivo: `frontend/app/dashboard/proposals/[id]/page.tsx`

Achados antes do ajuste:
- Proposta possuia links dispersos para origem CRM, contrato e documento.

Ajustes:
- Adicionado breadcrumb operacional.
- Adicionado `RelatedEntityGrid` com cliente, equipamento, oportunidade, contrato gerado e documento.
- Links sensiveis usam permissoes de propostas, contratos, clientes e equipamentos.

### Contrato

Arquivo: `frontend/app/dashboard/contracts/[id]/page.tsx`

Achados antes do ajuste:
- Contrato tinha dados financeiros, equipamentos e preventivas, mas sem mapa unico de navegacao.

Ajustes:
- Adicionado breadcrumb operacional.
- Adicionado `RelatedEntityGrid` com cliente, proposta de origem, equipamentos, OS preventivas e financeiro.
- Links financeiros ficam condicionados a `finance.view`.

### Laudo tecnico

Arquivo: `frontend/app/dashboard/relatorios-tecnicos/[id]/page.tsx`

Achados antes do ajuste:
- Laudo tinha foco documental, mas faltava mapa de relacionamento operacional.

Ajustes:
- Adicionado breadcrumb operacional.
- Adicionado `RelatedEntityGrid` com OS, equipamento, cliente, contrato e documento gerado.

### Catalogo / Item de estoque

Arquivo: `frontend/app/dashboard/catalog/[id]/page.tsx`

Achados antes do ajuste:
- O 20D ja havia criado rastreabilidade de estoque, mas faltava padrao global de breadcrumb e links permission-aware no cabecalho.

Ajustes:
- Adicionado breadcrumb operacional.
- Links para Catalogo, Estoque, Ajuste e Edicao respeitam `catalog.view`, `inventory.view`, `inventory.adjust` e `catalog.update`.

### Tecnico em campo

Arquivo: `frontend/app/dashboard/tecnico/ordens/[id]/page.tsx`

Achados antes do ajuste:
- Tela de campo nao precisava receber links internos amplos, para manter o escopo do tecnico enxuto.

Ajustes:
- Adicionado breadcrumb operacional limitado a `Campo > Ordem`.
- Mantida a decisao de nao expor links internos de financeiro/contratos para a tela de campo.

## 6. Backend ajustado

### Cliente

Arquivo: `backend/src/modules/clients/clients.service.ts`

Alteracoes:
- `findOne` passou a incluir:
  - ultimas OS por equipamento;
  - contrato e laudo relacionados a OS;
  - proposta com contrato gerado e oportunidade;
  - chamados do cliente;
  - laudos do cliente;
  - documento gerado do laudo com campos seguros.

Seguranca:
- Campos sensiveis como notas internas de chamado e storage key de documento nao foram adicionados ao payload.

### Ordem de servico

Arquivo: `backend/src/modules/maintenance-orders/maintenance-orders.service.ts`

Alteracoes:
- `orderInclude()` passou a selecionar `serviceReport`.
- `findAll`, `findOne` e retorno de `update` passam por `withCostVisibility`.
- `unitCost` de material vira `null` para perfis sem visibilidade de custo.

Perfis com custo visivel:
- `ADMIN`
- `MANAGER`
- `ENGINEER_APPLICATION`
- `SUPPLIES`
- `AUDITOR`

Perfis sem custo visivel:
- `TECHNICIAN`
- `CLIENT`
- demais perfis sem regra explicita de custo.

## 7. RBAC e seguranca

Padrao aplicado:
- Link so e navegavel quando:
  - existe `href`;
  - a rota e permitida por `canAccessDashboardPath`;
  - a permissao granular informada retorna verdadeira.

Exemplos:
- `contracts.view` para contrato.
- `finance.view` para financeiro.
- `serviceReports.view` para laudo.
- `catalog.view` para catalogo.
- `inventory.adjust` para ajuste de estoque.

Importante:
- Esconder link no frontend nao foi tratado como controle unico.
- Para custo de material de OS, houve reforco no backend com mascaramento de `unitCost`.

## 8. Testes criados ou alterados

Backend:
- `backend/src/modules/clients/clients.service.spec.ts`
  - valida que o include operacional do cliente traz referencias e nao inclui campos sensiveis como `internalNotes` e `fileStorageKey`.
- `backend/src/modules/maintenance-orders/maintenance-orders.service.spec.ts`
  - valida que tecnico nao recebe `unitCost`;
  - valida que admin continua recebendo `unitCost`.

Frontend E2E:
- `frontend/e2e/smart-navigation.spec.ts`
  - valida links cruzados entre Cliente, Equipamento, OS, Chamado, Proposta, Contrato e Laudo;
  - valida cliente do portal tentando rota interna por URL direta;
  - valida que a tela tecnica de campo nao ganhou links financeiros/contratuais internos.

## 9. Riscos e pendencias

- Prioridade: Medio
  - Categoria: UX
  - Problema: revisao visual fina de zoom/responsividade ainda nao foi feita neste ciclo.
  - Impacto: telas com muitos cards e tabelas ainda podem exigir ajustes em 125%/150%.
  - Recomendacao: deixar para Ciclo 20F com screenshots/baseline visual.
  - Arquivos relacionados: telas de detalhe em `frontend/app/dashboard`.
  - Esforco estimado: Medio.

- Prioridade: Medio
  - Categoria: Modelo operacional
  - Problema: Site/Local rico continua fora do escopo.
  - Impacto: relacionamento fisico do equipamento ainda depende de campos atuais.
  - Recomendacao: planejar ciclo proprio para Local/Site depois de links e responsividade.
  - Arquivos relacionados: `Generator.currentSite`, `Site`.
  - Esforco estimado: Alto.

- Prioridade: Baixo
  - Categoria: Historico
  - Problema: ficha tecnica de equipamento ainda nao tem historico versionado.
  - Impacto: mudancas tecnicas ficam no estado atual, sem trilha historica dedicada.
  - Recomendacao: ciclo futuro de auditoria tecnica de ativos.
  - Arquivos relacionados: `Generator`.
  - Esforco estimado: Medio.

- Prioridade: Medio
  - Categoria: Estoque
  - Problema: detalhamento maior de pecas por equipamento permanece pendente.
  - Impacto: rastreabilidade de peca aplicada existe por OS/catalogo, mas nao ha painel dedicado por equipamento e componente.
  - Recomendacao: tratar apos responsividade e links principais.
  - Arquivos relacionados: `CatalogItem`, `MaintenanceOrderMaterial`, `Generator`.
  - Esforco estimado: Medio.

## 10. Validacoes executadas

Auditoria inicial:
- Git `git status --short`: arvore limpa antes do inicio do 20E.
- Git `git log --oneline -10`: base confirmada em `1ecc051 feat: ciclo 20d estoque operacional rastreabilidade`.
- Git `git diff --stat`: sem diff antes do inicio.

Validadas durante o desenvolvimento:
- Backend `npm test -- --runInBand clients.service.spec.ts maintenance-orders.service.spec.ts`: passou, 2 suites / 11 testes.
- Frontend `npm run lint`: passou.
- Backend `npm run lint`: passou.
- Backend `npm run build`: passou.
- Frontend `npm run e2e -- e2e/smart-navigation.spec.ts`: passou, 3 testes.
- Frontend `npm run e2e -- e2e/ux-operational.spec.ts`: passou, 2 testes.
- Frontend `npm run e2e -- e2e/auth.spec.ts`: passou, 12 testes; repetido apos flake pontual de preenchimento do campo de e-mail no E2E completo.

Validacoes finais:
- Backend `npm run env:check`: passou.
- Backend `npm run db:preflight`: passou, `database=gridone_db`, `migrations=45`.
- Backend `npx prisma migrate status`: passou, banco atualizado.
- Backend `npm run lint`: passou.
- Backend `npm run build`: passou.
- Backend `npm test -- --runInBand`: passou, 33 suites / 193 testes.
- Backend `npm run seed:flow`: passou.
- Frontend `npm run lint`: passou.
- Frontend `npm run build`: passou apos liberar rede para o Next baixar Google Fonts (`Geist` e `Geist Mono`).
- Frontend `npm run e2e`: passou, 50 testes / 1 staging skipado.
- Git `git diff --check`: passou.
- Git `git diff --cached --check`: passou.

Checagem de escopo:
- `git diff --name-only | Select-String "pdf|staging|reconciliation|screenshot|\.env|log|cache"` retornou screenshots baseline atualizados e `frontend/app/dashboard/catalog/[id]/page.tsx`.
- `catalog` foi falso positivo por conter `log` no nome.
- Nao houve `.env`, staging, reconciliation, cache ou logs no diff.
- Screenshots em `docs/screenshots/ciclo-9` foram atualizados pela suite visual e inspecionados manualmente; nao estavam em loading.

## 11. Recomendacao objetiva

O Ciclo 20E deve ser fechado como navegacao cruzada operacional e padrao de links permission-aware.

O proximo bloco recomendado e o Ciclo 20F, focado exclusivamente em responsividade, zoom, largura de tabelas, baseline visual e polimento de layout. Nao recomendo misturar esse ajuste visual com novos campos, PDF, financeiro ou staging.
