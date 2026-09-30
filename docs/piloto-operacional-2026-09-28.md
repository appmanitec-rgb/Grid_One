# Piloto operacional isolado — 28/09/2026

## Resultado

O fluxo passou pela API com dados de demonstração no banco separado `gridone_pilot_20260928`:

1. Login de administrador, vendedor e cliente.
2. Oportunidade comercial e proposta de contrato vinculadas ao cliente e equipamento.
3. Aprovação interna e aceite do cliente pelo portal.
4. Conversão em contrato `CTR-90003` e criação de contas a receber.
5. Geração de OS preventiva, reserva de uma peça com referência à OS e movimento de estoque.
6. Pagamento parcial de um recebível.

A segunda conversão da proposta manteve o mesmo contrato e o mesmo número de recebíveis. A segunda geração de OS não criou novas ordens. As 19 verificações do script passaram.

O banco principal manteve **2.504 clientes, 1.482 equipamentos, 6.031 itens de catálogo e zero propostas, contratos e OS** antes e depois do piloto. A aplicação principal respondeu em `localhost:3000/health` e `localhost:3001/dashboard` com HTTP 200.

`npm run build` do backend passou. `npx tsc --noEmit` apontou cinco erros já presentes nos testes de RH e chamados (`hr-admin.service.spec.ts` e `tickets.service.spec.ts`), sem erros nos arquivos do piloto. A API auxiliar na porta 3002 foi desligada após a validação; o banco de piloto permanece separado para repetição.

## Como repetir

Com a API de piloto apontando para `gridone_pilot_20260928` na porta 3002, execute `backend/scripts/pilot-operational-flow.cjs` com `DATABASE_URL` do banco de piloto e `SEED_DEMO_PASSWORD` do seed de demonstração. O script recusa bancos cujo nome não comece por `gridone_pilot_` e APIs fora da porta 3002. Cada execução cria uma nova oportunidade e proposta nesse banco.

O banco de piloto foi preparado com `prisma db push --skip-generate`, seguido de `backend/prisma/pilot-bootstrap.sql`, `prisma/seed.ts` e `prisma/seed-flow.ts`. Os arquivos do seed ficam em armazenamento local separado quando `FILE_STORAGE_LOCAL_PATH` é definido. O seed de demonstração foi corrigido para incluir a condição de pagamento **Mensal**, necessária para criar novas propostas.

## Pendências encontradas

- **Instalação limpa:** `prisma migrate deploy` falha em `20260309155103_finance_hr_core/migration.sql`, linha 98, porque altera `service_contracts` antes de a tabela existir. O piloto usou o schema atual com `db push` como solução temporária. A tabela `_prisma_migrations` criada para o piloto permanece vazia; ela não representa migrations aplicadas. É preciso corrigir a trilha de instalação para novos ambientes, sem reescrever migrations já aplicadas na base principal.
- **Rastreio da peça:** a reserva registra `referenceType` e `referenceId` da OS, mas este piloto não verificou consumo efetivo, baixa de estoque ou custo da peça na OS. Isso deve ser exercitado no próximo teste operacional.
- **Interface:** o fluxo foi validado pela API. A experiência visual do operador e do cliente ainda precisa de uma passada no navegador compartilhado quando ele estiver disponível para o agente.
