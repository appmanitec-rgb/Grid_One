# Seeds e dados demo

## Tipos de seed

### `npm run seed`

Seed minimo/base. Usado para criar usuarios iniciais e dados essenciais conforme `backend/prisma/seed.ts`.

Variaveis principais:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_NAME`
- `SEED_ADMIN_PASSWORD`
- `SEED_MASTER_EMAIL`
- `SEED_MASTER_NAME`
- `SEED_MASTER_PASSWORD`

### `npm run seed:flow`

Seed completo de fluxo demo/E2E. Cria clientes, equipamentos, propostas, contratos, OS, chamados, laudos, financeiro, compra e usuarios por perfil.

Exige:

```powershell
$env:SEED_DEMO_PASSWORD="senha-forte-do-piloto"
npm run seed:flow
```

## Usuarios demo

O seed de fluxo cria usuarios como:

- `admin.demo@manitec.local`
- `gestor.demo@manitec.local`
- `vendas.demo@manitec.local`
- `operacao.demo@manitec.local`
- `tecnico.demo@manitec.local`
- `financeiro.demo@manitec.local`
- `auditor.demo@manitec.local`
- `cliente.a.demo@manitec.local`
- `cliente.b.demo@manitec.local`

Esses usuarios sao para desenvolvimento, QA ou piloto isolado. Nao usar em producao real.

## Producao

Para producao:

- use `npm run seed` com senha forte;
- crie usuarios reais com MFA;
- nao configurar `SEED_DEMO_PASSWORD`;
- nao rodar `seed:flow` em banco de producao real.

## E2E

A suite Playwright depende dos dados de `seed:flow`.

Variaveis:

- `E2E_DEMO_PASSWORD`
- `E2E_TOTP_SECRET`
- `E2E_API_URL`
- `E2E_BASE_URL`

Rodar:

```powershell
cd frontend
npm run e2e
```
