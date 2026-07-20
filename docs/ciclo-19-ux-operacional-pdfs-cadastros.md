# Ciclo 19 - Motor de PDFs profissionais

## Resumo executivo

O Ciclo 19 foi fechado como ciclo focado em PDF profissional por template, sem homologacao de staging e sem novas features de infraestrutura. O problema principal corrigido foi a geracao de PDF com aparencia de impressao de tela; propostas comerciais agora usam template versionado, variaveis controladas, geracao server-side, storage privado, `DocumentDelivery`, checksum e controle de acesso no portal.

Tambem ficaram no estado validado alguns ajustes preparatorios de UX operacional, como Meu Perfil mais seguro, Agentes, ficha de equipamento e links de estoque. Esses ajustes nao encerram o escopo amplo de UX operacional; o ciclo deve ser considerado entregue pelo motor de PDFs profissionais.

Resultado: proposta comercial deixou de depender de print/tela do ERP e passou a ser documento server-side rastreavel. A suite E2E completa passou com 46 testes e 1 teste remoto de staging skipado por seguranca.

## O que foi alterado

- Meu Perfil passou a expor apenas dados pessoais/conta permitidos.
- Backend de `users/me` agora usa select seguro e ignora campos administrativos em update proprio.
- Tela de Pessoas foi reposicionada como Agentes, separando colaboradores internos, usuarios do sistema, clientes do portal e auditores.
- Backend ganhou `GET /hr-admin/agents` para separar perfis sem misturar CLIENT em colaboradores.
- Ficha de equipamento passou a mostrar contexto tecnico, cliente, contratos, pecas base, propostas, OS, chamados e laudos.
- Cadastro de equipamento passou a aceitar campos mestres ja existentes no schema: tag, local, status operacional, ciclo de vida, criticidade, ano, datas e contrato de manutencao.
- Estoque ganhou link direto para ficha do catalogo em cada saldo.
- Proposta ganhou PDF profissional binario server-side por template versionado em `GET /documents/proposals/:id/download-pdf`.
- Portal ganhou download autorizado do PDF profissional da proposta em `GET /customer-portal/proposals/:id/download-pdf`.
- Motor de templates PDF criado com `DocumentTemplateService`, `TemplateRendererService`, `PdfRenderService` e `ProposalPdfService`.
- PDFs de proposta agora geram `DocumentDelivery` com storage privado, hash/checksum, template e versao.
- Documento HTML de proposta ganhou botao para baixar PDF profissional.
- E2E novo cobre perfil limpo, agentes, ficha de equipamento, estoque e PDF de proposta.
- Baselines visuais em `docs/screenshots/ciclo-9` foram atualizados pela suite E2E.

## Arquivos principais

- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/hr-admin/hr-admin.service.ts`
- `backend/src/modules/hr-admin/hr-admin.controller.ts`
- `backend/src/modules/generators/generators.service.ts`
- `backend/src/modules/documents/proposal-pdf.service.ts`
- `backend/src/modules/documents/document-template.service.ts`
- `backend/src/modules/documents/template-renderer.service.ts`
- `backend/src/modules/documents/pdf-render.service.ts`
- `backend/src/templates/pdf/proposal/manitec-default-v1`
- `backend/src/modules/documents/documents.controller.ts`
- `backend/src/modules/documents/documents.service.ts`
- `docs/pdf-template-audit.md`
- `frontend/app/dashboard/profile/page.tsx`
- `frontend/app/dashboard/hr/collaborators/page.tsx`
- `frontend/app/dashboard/equipments/[id]/page.tsx`
- `frontend/app/dashboard/equipments/new/page.tsx`
- `frontend/app/dashboard/inventory/page.tsx`
- `frontend/app/dashboard/documents/proposals/[id]/page.tsx`
- `frontend/e2e/ux-operational.spec.ts`

## Migrations

Nenhuma migration criada. O ciclo usou campos e relacionamentos ja existentes no Prisma schema, incluindo `DocumentDelivery`.

## Testes criados/alterados

- `backend/src/modules/documents/proposal-pdf.service.spec.ts`
- `backend/src/modules/documents/documents.service.spec.ts`
- `backend/src/modules/hr-admin/hr-admin.service.spec.ts`
- `backend/src/modules/users/users.service.spec.ts`
- `frontend/e2e/ux-operational.spec.ts`

## Validacoes executadas

- Backend `npm run env:check`: passou.
- Backend `npm run db:preflight`: passou, banco `gridone_db` com 44 migrations.
- Backend `npx prisma migrate status`: passou, schema atualizado.
- Backend `npm run lint`: passou sem warnings.
- Backend `npm run build`: passou.
- Backend `npm test -- --runInBand`: passou, 32 suites / 174 testes.
- Backend `npm run seed:flow`: passou com `SEED_DEMO_PASSWORD` temporario local para validacao.
- Frontend `npm run lint`: passou.
- Frontend `npm run build`: passou com rede liberada para Google Fonts.
- Frontend `npm run e2e -- e2e/commercial-contract-finance.spec.ts`: passou, 2 testes.
- Frontend `npm run e2e -- e2e/ux-operational.spec.ts`: passou, 1 teste.
- Frontend `npm run e2e`: passou, 46 testes, 1 staging skipado.
- `git diff --check`: passou; apenas avisos esperados de CRLF/LF no Windows.

## Decisoes

- Screenshots em `docs/screenshots/ciclo-9` foram mantidos como baseline visual oficial atualizado pelo E2E.
- O PDF de proposta nao usa pagina do frontend e nao inclui campos internos como custo HH, limite de desconto, margem, menu ou botoes.
- O PDF de proposta e um PDF binario real gerado server-side a partir de template versionado por pasta.
- Contrato/OS ganharam estrutura de template, mas render completo fica pendente.
- Agentes agora e a nomenclatura operacional para pessoas internas, usuarios do sistema, clientes externos e auditores.
- A falha inicial do E2E de PDF no portal foi causada por processos antigos nas portas `3000` e `3001`, nao por bug da rota nova. Os processos foram encerrados e os specs passaram em seguida.

## Riscos restantes

- PDF profissional funcional foi implementado apenas para propostas; contrato e OS ainda merecem PDF server-side dedicado.
- O renderizador atual nao depende de Chromium/Puppeteer; a troca para render HTML/CSS completo deve ser homologada quando a dependencia for aceita em producao.
- Templates comerciais ainda nao possuem editor parametrizado.
- Cadastro de equipamento foi enriquecido no create, mas edicao dedicada completa pode ser refinada em ciclo futuro.
- Agentes separa perfis, mas ainda nao e uma tela administrativa completa de governanca de identidades.
- Baseline visual mudou por execucao E2E e deve ser revisado visualmente antes do commit se houver politica manual de QA.
- Runner E2E deveria detectar portas `3000`/`3001` ocupadas por processos antigos antes de iniciar novos servidores.

## Recomendacao

O proximo passo funcional deve ficar fora deste commit. As opcoes naturais sao migrar contrato, OS e laudo para PDFs server-side profissionais ou abrir um ciclo separado para Perfil, Agentes, Cadastros Mestres, links inteligentes e responsividade.
