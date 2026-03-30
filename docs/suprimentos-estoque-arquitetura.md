# Suprimentos & Estoque - Arquitetura ERP

## Base mestre (catalogo)
- `CatalogItem` segue como dicionario tecnico/comercial.
- Campos usados para acuracia: `sku`, `manufacturerPartNumber`, custos e margens.
- Vinculos com modelos de gerador permanecem via `ModelBaseItem` e `GeneratorBaseItem`.

## Inventario multilocal
- `Warehouse`: almoxarifado matriz e estoques moveis (carro de tecnico).
- `InventoryBalance`: saldo por item/almoxarifado com tripla visao:
  - `physicalQty`
  - `reservedQty`
  - `available = physical - reserved`
- `InventoryMovement`: trilha de movimentacoes (ajuste, transferencia, reserva, recebimento de compra, etc).

## Supply chain
- `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseOrderReceipt`.
- Fluxo:
  1. cria pedido
  2. aprova pedido
  3. gera `AccountsPayable` automaticamente
  4. recebe material
  5. entrada no estoque + recalculo de custo medio e ultimo custo

## Integracoes automaticas implementadas
- O.S. reservando materiais:
  - aumenta `reservedQty`
  - registra `InventoryMovement.RESERVATION`
- Remocao/atualizacao de O.S. libera reserva:
  - reduz `reservedQty`
  - registra `InventoryMovement.RELEASE`
- Reposicao inteligente:
  - endpoint calcula itens abaixo do minimo por almoxarifado
  - sugere fornecedor com melhor lead time/preco (baseado em `SupplierCatalogItem`)

## Endpoints novos
- `GET /inventory/warehouses`
- `GET /inventory/summary`
- `GET /inventory/replenishment-drafts`
- `POST /inventory/adjust`
- `POST /inventory/transfer`
- `POST /inventory/reserve`
- `POST /inventory/release`
- `POST /purchase-orders`
- `GET /purchase-orders`
- `GET /purchase-orders/:id`
- `PATCH /purchase-orders/:id/status`
- `POST /purchase-orders/:id/receive`
