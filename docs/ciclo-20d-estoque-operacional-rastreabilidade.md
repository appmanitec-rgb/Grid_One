# Ciclo 20D - Estoque operacional, detalhe editavel e rastreabilidade

## 1. Resumo executivo

O Ciclo 20D transformou o estoque/catalogo de uma tela majoritariamente visual em uma ficha operacional navegavel, com saldo agregado, saldos por almoxarifado, movimentos recentes, compras relacionadas, OS relacionadas, fornecedores e links cruzados.

O ciclo tambem endureceu uma regra critica: saldo de estoque nao pode ser alterado diretamente pelo cadastro do item. Saldo continua mudando por movimento, compra, consumo, reserva, transferencia ou ajuste auditado.

Este ciclo nao declara o modulo de estoque como completo. O foco foi detalhe operacional, rastreabilidade e protecao de edicao indevida de saldo.

## 2. Commit base

- Base obrigatoria: `e1fc4a5 feat: ciclo 20c equipamentos tecnicos links operacionais`
- Checkpoint anterior: `v0.20c-equipment-ops`

## 3. Auditoria inicial do estoque

Modelos encontrados:

- `CatalogItem`: cadastro do item, precos, custos, estoque minimo/maximo, localizacao e relacoes.
- `InventoryBalance`: saldo fisico/reservado por almoxarifado, minimo/maximo e `reorderPoint`.
- `InventoryMovement`: movimentos de entrada, saida, transferencia, reserva, liberacao, ajuste, recebimento de compra e consumo em OS.
- `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseOrderReceipt`: compras e recebimento.
- `Supplier`, `SupplierCatalogItem`: fornecedores e vinculos com itens.
- `MaintenanceOrderMaterial`: materiais reservados/aplicados em OS.

Endpoints encontrados antes do ciclo:

- `GET /catalogs`
- `GET /catalogs/:id`
- `PATCH /catalogs/:id`
- `GET /inventory/summary`
- `GET /inventory/replenishment-drafts`
- `POST /inventory/adjust`
- `POST /inventory/transfer`
- `POST /inventory/reserve`
- `POST /inventory/release`
- `GET /purchase-orders`
- `GET /suppliers/:id`

Problemas encontrados:

- `GET /catalogs/:id` trazia fornecedores, mas nao trazia detalhe operacional completo.
- `PATCH /catalogs/:id` aceitava `stockCurrent`, permitindo edicao direta de saldo materializado.
- `InventoryService.summary()` expunha `avgCost` sem receber ator/permissao.
- `replenishmentDrafts()` podia expor preco sugerido de fornecedor para perfil sem custo.
- A tela de detalhe do item era cadastral, mas pobre em rastreabilidade.
- Lista de catalogo nao tinha busca operacional nem KPIs.
- Ajuste de saldo aparecia no frontend mesmo para quem nao tinha `inventory.adjust`.

## 4. Alteracoes backend

Catalogo:

- `CatalogsService.findOne()` agora retorna detalhe operacional com relacoes limitadas:
  - fornecedores vinculados;
  - saldos por almoxarifado;
  - movimentos recentes;
  - compras relacionadas;
  - OS relacionadas por material;
  - equipamentos relacionados via OS e itens base.
- Foram adicionados endpoints auxiliares:
  - `GET /catalogs/:id/movements`
  - `GET /catalogs/:id/purchase-orders`
  - `GET /catalogs/:id/orders`
  - `GET /catalogs/:id/suppliers`
- `CatalogsService.update()` bloqueia `stockCurrent`, `physicalQty` e `reservedQty`.
- `stockMin`, `stockMax` e `reorderPoint` atualizam metas dos balances existentes, sem mexer em saldo.
- Custos sensiveis agora sao mascarados de forma mais completa quando o ator nao tem `catalog.viewCosts`.

Inventory:

- `InventoryController.summary()` e `replenishmentDrafts()` passam o ator para o service.
- `InventoryService.summary()` retorna `avgCost` apenas para quem pode ver custos.
- `InventoryService.replenishmentDrafts()` mascara `supplierPrice` sem `catalog.viewCosts`.

## 5. Alteracoes frontend

Lista de catalogo:

- Busca por nome, SKU, categoria e localizacao.
- KPIs de itens ativos, pecas, servicos e baixo estoque.
- Colunas operacionais de SKU/localizacao e saldo.
- Acao clara `Abrir`.

Detalhe do item:

- Nova ficha operacional em `/dashboard/catalog/[id]`.
- Mostra identificacao, status, categoria, fornecedor principal e descricao.
- Cards de saldo atual, reservado, disponivel, minimo, maximo e ponto de reposicao.
- Aba de saldo por almoxarifado.
- Aba de rastreabilidade com movimentos, compras, OS e equipamentos.
- Aba de fornecedores vinculados.
- Aba tecnica/fiscal.
- Link de edicao aparece somente com `catalog.update` ou `catalog.manageItems`.
- Link de ajuste aparece somente com `inventory.adjust`.

Formulario de item:

- `stockCurrent` deixou de ser input editavel.
- Saldo atual aparece apenas como leitura/informacao.
- `reorderPoint` foi adicionado como meta operacional.
- `description` e `isActive` foram adicionados ao cadastro.
- Custos/margens ficam ocultos no formulario para perfil sem `catalog.viewCosts`.

Links cruzados:

- OS material -> ficha do item.
- Compra -> fornecedor.
- Compra -> ficha do item.
- Fornecedor -> ficha do item.
- Estoque/lista -> ficha do item.

## 6. Migrations

Nenhuma migration foi criada.

Justificativa: os campos necessarios ja existiam no schema:

- `CatalogItem.description`
- `CatalogItem.stockMin`
- `CatalogItem.stockMax`
- `CatalogItem.storageLocation`
- `CatalogItem.isActive`
- `InventoryBalance.reorderPoint`

## 7. Links implementados

- `/dashboard/inventory` -> `/dashboard/catalog/:id`
- `/dashboard/catalog/:id` -> `/dashboard/suppliers/:id`
- `/dashboard/catalog/:id` -> `/dashboard/orders/:id`
- `/dashboard/catalog/:id` -> `/dashboard/equipments/:id`
- `/dashboard/catalog/:id` -> `/dashboard/clients/:id`
- `/dashboard/orders/:id` -> `/dashboard/catalog/:id`
- `/dashboard/purchase-orders` -> `/dashboard/suppliers/:id`
- `/dashboard/purchase-orders` -> `/dashboard/catalog/:id`
- `/dashboard/suppliers/:id` -> `/dashboard/catalog/:id`

## 8. RBAC

Permissoes reutilizadas:

- `catalog.view`
- `catalog.update`
- `catalog.manageItems`
- `catalog.viewCosts`
- `inventory.view`
- `inventory.adjust`
- `purchaseOrders.view`

Regras validadas:

- Cliente nao acessa endpoint interno de catalogo/estoque.
- Portal do cliente continua isolado por cliente; este ciclo nao abriu dados internos de estoque para o portal.
- Auditor visualiza ficha operacional sem acao de edicao.
- Edicao cadastral continua protegida por `catalog.update`.
- Ajuste de saldo continua protegido por `inventory.adjust`.
- Custo medio, ultimo custo, custo unitario, preco de fornecedor e totais de compra sao mascarados sem `catalog.viewCosts`.

## 9. Testes backend

Criados/alterados:

- `backend/src/modules/catalogs/catalogs.service.spec.ts`
- `backend/src/modules/inventory/inventory.service.spec.ts`
- `backend/src/modules/users/access-policy.spec.ts`

Cobertura adicionada:

- detalhe operacional do item com saldos e relacoes;
- mascaramento de custo sem permissao;
- custo visivel para usuario autorizado;
- bloqueio de edicao direta de saldo;
- atualizacao de cadastro/metas sem mexer em saldo;
- resumo de inventory sem `avgCost` para perfil sem custo;
- reposicao sem `supplierPrice` para perfil sem custo;
- separacao RBAC de estoque para suprimentos, auditor, tecnico, comercial e cliente.

## 10. E2E

Arquivo alterado:

- `frontend/e2e/ux-operational.spec.ts`

Cobertura adicionada:

- admin abre estoque;
- admin abre ficha operacional do item;
- admin ve saldo, fornecedor, movimentos, compras e OS relacionadas;
- admin edita localizacao e ponto de reposicao;
- saldo direto nao aparece como input editavel;
- fornecedor linka de volta ao item;
- OS linka para item consumido/reservado;
- cliente recebe `403` em catalogo interno;
- auditor recebe `403` em PATCH de catalogo;
- admin recebe `400` ao tentar alterar `stockCurrent` diretamente;
- auditor visualiza ficha sem link de edicao.

## 11. Validacoes executadas

Reconhecimento:

- `git status --short`: arvore limpa antes do inicio.
- `git log --oneline -10`: base confirmada em `e1fc4a5`.
- `git diff --stat`: sem diff inicial.

Backend:

- `npm run env:check`: passou.
- `npm run db:preflight`: passou, banco `gridone_db`, 45 migrations.
- `npx prisma migrate status`: passou, schema atualizado.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm test -- --runInBand`: passou, 33 suites / 190 testes.
- `npm run seed:flow` com `SEED_DEMO_PASSWORD=Demo@123456`: passou.

Frontend:

- `npm run lint`: passou.
- `npm run build`: passou com rede liberada para Google Fonts.
- `npm run e2e -- e2e/ux-operational.spec.ts`: passou, 2 testes.
- `npm run e2e`: passou, 47 testes e 1 staging remoto skipado.

Observacao:

- A primeira tentativa focada de E2E encontrou um `tag` residual em select de `Generator`; corrigido para `assetTag`.
- Uma tentativa focada tambem mostrou que o teste combinado passava do timeout padrao de 120s; o timeout foi ajustado apenas para esse teste.

## 12. Riscos restantes

- Estoque ainda nao possui tela dedicada de movimento por almoxarifado com paginacao completa.
- Ajuste manual ja existe, mas nao foi redesenhado neste ciclo.
- `stockCurrent` segue como campo materializado legado; a fonte operacional deve ser `InventoryBalance` + `InventoryMovement`.
- Links de compra ainda apontam para a tela geral de pedidos, pois nao ha detalhe rico de pedido de compra.
- Auditoria de alteracao cadastral do item ainda nao registra diff campo a campo.
- Validacao visual fina em zoom 110%, 125% e 150% ainda depende de revisao manual.

## 13. Pendencias

- Criar detalhe rico de pedido de compra.
- Criar tela de movimentos do item com filtros/paginacao.
- Criar ajuste de saldo guiado por item com confirmacao e motivo mais forte.
- Criar relatorio de rastreabilidade completo por item/equipamento/OS.
- Revisar politica operacional para quem pode ver custo medio, custo unitario e preco de fornecedor.

## 14. Proximo ciclo recomendado

Proximo bloco recomendado:

- Ciclo 20E - Links inteligentes globais e navegacao cruzada.

Fora do escopo deste ciclo e nao alterado intencionalmente:

- PDF.
- Financeiro pesado.
- Staging.
- Multitenancy.
- Agentes completo.
- Site/Local rico.
- Historico versionado de ficha tecnica.
