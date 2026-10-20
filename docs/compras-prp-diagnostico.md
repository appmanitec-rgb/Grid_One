# Compras — diagnóstico e plano de evolução

## Diagnóstico confirmado
- API NestJS, PostgreSQL e Prisma 5; interface Next.js/React com componentes próprios e campos pesquisáveis limitados a dez resultados.
- Reutilizar PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, Supplier, CatalogItem, ApprovalRequest, AccountsPayable, InventoryBalance, InventoryMovement, SystemAuditLog e armazenamento privado.
- A aprovação legada cria conta a pagar integral; o recebimento também garante a existência desse título. Preservar exclusivamente nos pedidos de versão 1.
- A interface legada recebe todo o saldo; estender com conferência por item na experiência nova.
- Estoque disponível = físico menos reservado; a sugestão existente não desconta pedidos pendentes. A nova análise considera as entradas pendentes por destino; a sugestão e as rotinas legadas foram preservadas.
- Existem permissões de tela e ação, perfis por departamento e auditoria. Estender a mesma matriz.
- A aprovação existente usa aprovador designado e histórico; reutilizar os registros para cotações e conservar as demais decisões.

## Extensões e entidades
Solicitações e alocações por item; cotações, fontes consolidadas, convites, propostas versionadas e seleções por item; regras configuráveis de aprovação; recebimentos detalhados; documentos de entrada, parcelas e compromissos financeiros. Pedidos e títulos oficiais continuam nas tabelas atuais.

## Riscos e controles
Concorrência e reenvios: transações, bloqueios e chaves únicas. Valores: Decimal e arredondamento monetário explícito. Compatibilidade: workflowVersion=1 para registros existentes e pedidos manuais; novo fluxo versão 2. Permissões no servidor e matriz, inclusive decisões pelo endpoint genérico de aprovações. Documentos privados e autorizados.

## Implantação
Migração somente aditiva, validada no banco gridone_e2e; nova experiência desligada por padrão. Nenhuma migração ou ativação no banco operacional sem autorização explícita, conforme a seção 20 do PRP. Desligar a experiência conserva todos os documentos e títulos já criados.

## Etapas de execução
1. Esquema aditivo e testes de caracterização.
2. Solicitações, vínculos e disponibilidade projetada.
3. Cotações, versões, comparação e seleção justificada.
4. Aprovações e geração idempotente dos pedidos existentes.
5. Recebimento parcial, destinação e financeiro documental.
6. Testes dos cenários A–H, compilação, documentação e procedimento de ativação.
