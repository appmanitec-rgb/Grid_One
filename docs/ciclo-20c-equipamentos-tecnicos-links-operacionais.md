# Ciclo 20C - Equipamentos tecnicos, cadastro mestre e links operacionais

Base obrigatoria: `bcc840a feat: ciclo 20b proteger dados sensiveis em agentes`
Checkpoint anterior: `v0.19-pdf-templates` em `f78ac47`

## 1. Resumo executivo

O Ciclo 20C transformou Equipamentos de um cadastro operacional basico em uma ficha tecnica mais proxima de cadastro mestre de geradores. A alteracao ficou limitada ao escopo de Equipamentos, RBAC, links operacionais e portal seguro do cliente.

Ficaram fora do ciclo: PDF, financeiro, staging, conciliacao, estoque completo, multitenancy e reorganizacao completa de Agentes.

## 2. Auditoria inicial do modulo Equipamentos

Backend encontrado:

- Prisma tinha `Generator`, `GeneratorModel`, `Site`, `MaintenanceOrder`, `ServiceReport`, `ServiceContract`, `ServiceTicket`, `GeneratorBaseItem` e `InventoryMovement`.
- `Generator` ja tinha cliente, site atual, modelo, OS, laudos, chamados, contratos, agenda preventiva e itens base.
- Campos tecnicos profundos nao existiam: motor, alternador, QTA, bateria, tensao, corrente, fator de potencia, regime e observacoes tecnicas.
- `GeneratorsController` usava apenas `pages.equipments`, sem granularidade de criacao/edicao/exclusao.
- `GeneratorsService.findOne()` trazia relacoes uteis, mas sem limites em algumas listas.
- Testes de `GeneratorsService` eram apenas smoke de definicao.

Frontend encontrado:

- Lista em `/dashboard/equipments` exibia nome/modelo, serie, cliente, status fixo e acao de detalhe.
- Criacao em `/dashboard/equipments/new` ja tinha secoes simples, mas nao tinha motor, alternador, QTA e bateria.
- Detalhe em `/dashboard/equipments/[id]` ja tinha links para cliente, contrato, OS, laudos, chamados e pecas base, mas nao tinha edicao tecnica nem campos tecnicos completos.
- Portal do cliente ja listava e detalhava equipamentos isolados por cliente.

E2E encontrado:

- `frontend/e2e/ux-operational.spec.ts` validava navegabilidade da ficha.
- `frontend/e2e/client-portal.spec.ts` validava isolamento de cliente A/B.
- Nao havia teste de edicao tecnica nem bloqueio de edicao por auditor.

## 3. Campos tecnicos adicionados

Migration criada:

- `backend/prisma/migrations/20260720120000_ciclo_20c_generator_technical_fields/migration.sql`

Campos opcionais adicionados em `Generator`:

- Identificacao: `application`, `notes`
- Gerador: `voltage`, `ratedCurrent`, `powerFactor`, `frequencyHz`, `operationMode`
- Motor: `engineBrand`, `engineModelName`, `engineSerialNumber`, `enginePower`, `fuelType`, `engineCylinders`, `oilRecommendation`, `oilCapacityLiters`, `lastOilChangeAt`
- Alternador: `alternatorBrand`, `alternatorModelName`, `alternatorSerialNumber`, `alternatorVoltage`, `alternatorFrequencyHz`, `alternatorInsulationClass`, `alternatorProtectionDegree`
- QTA: `hasTransferSwitch`, `transferSwitchBrand`, `transferSwitchModel`, `transferSwitchSerialNumber`, `transferSwitchRatedCurrent`, `transferSwitchCommandVoltage`, `transferSwitchType`, `transferSwitchNotes`
- Bateria/carregador: `batteryQuantity`, `batteryVoltage`, `batteryCapacityAh`, `batteryInstallationDate`, `batteryChargerModel`, `batteryLastReplacementDate`

Todos os campos sao nullable/opcionais para nao quebrar equipamentos existentes.

## 4. Melhorias backend/API

- `CreateGeneratorDto` e `UpdateGeneratorDto` aceitam os novos campos tecnicos opcionais.
- `GeneratorsService.create()` e `update()` mapeiam campos tecnicos de forma centralizada.
- `findAll()` passou a retornar resumo operacional limitado:
  - cliente;
  - modelo;
  - local;
  - ultima OS;
  - proxima preventiva;
  - contrato recente;
  - chamados abertos recentes.
- `findOne()` passou a limitar relacoes recentes e incluir:
  - contratos;
  - preventivas;
  - OS recentes;
  - laudos;
  - chamados com OS convertida;
  - materiais aplicados nas OS recentes;
  - itens base.
- `seed-flow` passou a preencher dados tecnicos realistas nos equipamentos demo.

## 5. RBAC

Permissoes adicionadas:

- `equipments.view`
- `equipments.create`
- `equipments.update`
- `equipments.delete`
- `equipments.manageModels`

Aplicacao:

- Endpoints de leitura exigem `pages.equipments` + `equipments.view`.
- Criacao exige `equipments.create`.
- Edicao e itens base exigem `equipments.update`.
- Modelos exigem `equipments.manageModels`.
- Exclusao exige `equipments.delete`.
- Manager/Admin podem editar.
- Auditor visualiza sem editar.
- Tecnico visualiza sem editar.
- Cliente externo segue sem rota interna de Equipamentos.

## 6. Melhorias frontend

Lista interna `/dashboard/equipments`:

- KPI de total, criticidade A, contratos e chamados abertos.
- Busca por nome, tag, serie, cliente, local e modelo.
- Cards responsivos com status, criticidade, cliente, local, modelo, potencia, horimetro, tensao, ultima OS, proxima preventiva, contrato e chamados.
- Acoes de criar/modelos aparecem conforme RBAC.

Detalhe interno `/dashboard/equipments/[id]`:

- Abas: resumo tecnico, historico/links e editar ficha.
- Resumo tecnico com identificacao, gerador, motor, alternador, QTA, bateria e observacoes.
- Historico com OS, laudos, chamados, contratos/preventivas, pecas aplicadas e pecas base.
- Edicao tecnica organizada por secoes, visivel apenas com `equipments.update`.

Criacao `/dashboard/equipments/new`:

- Formulario em secoes:
  - identificacao/vinculos;
  - dados do gerador;
  - motor;
  - alternador;
  - QTA/bateria/observacoes.
- Suporta cliente, site/local, modelo, copia de itens base e campos tecnicos opcionais.

Links operacionais:

- Equipamento para cliente, local/site, contrato, OS, laudos, chamados e catalogo.
- OS para equipamento, cliente e contrato.
- Chamado para cliente, equipamento e OS convertida.
- Contrato ja possuia links para equipamentos, preventivas e cliente.

Portal:

- O portal do cliente passou a exibir campos seguros adicionais no detalhe do equipamento: aplicacao, tensao, horimetro e condicao.
- Isolamento por cliente foi preservado.

## 7. Testes

Backend:

- `GeneratorsService` passou a testar criacao com campos tecnicos opcionais.
- `GeneratorsService` passou a testar update de campos tecnicos em equipamento existente.
- `GeneratorsService.findAll()` passou a testar resumo operacional com relacoes limitadas.
- `defaultAccessPolicyByRole` passou a testar separacao entre leitura e edicao de equipamentos.

E2E:

- Admin abre lista de equipamentos.
- Admin abre detalhe de equipamento.
- Admin ve secoes tecnicas.
- Admin edita campos tecnicos opcionais.
- Equipamento mostra links/historico em aba propria.
- Cliente externo recebe `403` no endpoint interno `/generators/:id`.
- Auditor abre equipamento sem botao de edicao.

## 8. Responsividade e zoom

As telas novas evitam tabelas largas como superficie principal:

- Lista usa cards responsivos.
- Detalhe usa grids fluidos.
- Formularios usam grids `md`/`xl` e campos com largura fluida.
- A barra de acao do formulario e fixa/aderente apenas no final, sem largura fixa.

Validacao automatizada cobre navegabilidade desktop. Validacao manual fina em 110%, 125% e 150% ainda e recomendada antes de tag.

## 9. Comandos executados

Reconhecimento inicial:

- `git status --short`: arvore limpa antes do inicio.
- `git log --oneline -10`: base confirmada em `bcc840a`.
- `git diff --stat`: sem diff inicial.

Banco e Prisma:

- `npx prisma format`: passou.
- `npx prisma generate`: passou.
- `npm run db:migrate`: passou, migration `20260720120000_ciclo_20c_generator_technical_fields` aplicada.
- `npm run db:preflight`: passou, banco `gridone_db` e 45 migrations.
- `npx prisma migrate status`: passou, schema atualizado.
- `npm run seed:flow` com `SEED_DEMO_PASSWORD=Demo@123456` na sessao: passou.

Backend:

- `npm run env:check`: passou, ambiente `development` e storage `local`.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm test -- --runInBand`: passou, 32 suites / 182 testes.

Frontend:

- `npm run lint`: passou.
- `npm run build`: passou; a primeira tentativa falhou por bloqueio de rede no download de Google Fonts, e a nova execucao com rede liberada passou.
- `npm run e2e -- e2e/ux-operational.spec.ts`: passou, 2 testes.
- `npm run e2e`: passou, 47 testes executados com sucesso e 1 staging remoto skipado.

Git/checks:

- `git diff --check`: passou.
- `git diff --cached --check`: passou, sem arquivos staged.
- `git diff --name-only | Select-String -Pattern 'screenshot'`: sem screenshots no diff apos restaurar baseline gerado pelo E2E.

## 10. Riscos restantes

- A ficha tecnica esta no proprio `Generator`; em uma fase futura, pode ser interessante separar em `GeneratorTechnicalSpec` se houver historico/versionamento tecnico.
- Campos tecnicos nao possuem historico de alteracao campo a campo.
- Local/site ainda linka para lista de locais, pois nao ha tela rica dedicada de detalhe de site.
- Pecas aplicadas sao exibidas a partir das OS recentes, nao como modulo completo de estoque.
- Auditoria de alteracao de ficha tecnica ainda fica no nivel geral de update, sem diff tecnico dedicado.
- Validacao visual fina de zoom ainda depende de revisao manual.

## 11. Pendencias para ciclos futuros

- Criar tela de detalhe de Site/Local.
- Criar historico tecnico versionado para alteracoes de ficha.
- Criar anexos/documentos especificos de equipamento, se o modelo documental for expandido.
- Ampliar estoque aplicado por equipamento com filtros e paginacao.
- Criar campos parametrizaveis por tipo/modelo de gerador, caso a operacao precise de fichas diferentes por familia.

## 12. Status de escopo

Implementado neste ciclo:

- Equipamentos tecnicos.
- Cadastro mestre com campos opcionais.
- Lista e detalhe operacional.
- Links internos principais.
- RBAC granular de Equipamentos.
- Testes backend e E2E criticos.

Fora do escopo e nao alterado intencionalmente:

- PDF.
- Financeiro.
- Staging.
- Conciliacao bancaria.
- Estoque completo.
- Multitenancy.
- Reorganizacao completa de Agentes.
