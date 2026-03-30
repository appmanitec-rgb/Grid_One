# Fluxo Exemplo Completo (Ponta a Ponta)

Este projeto agora possui um seed de fluxo completo para validar todos os modulos com dados encadeados.

## Como gerar o fluxo demo

No backend (`Manitec_GridOne/backend`):

```bash
npm run seed
SEED_DEMO_PASSWORD=<SENHA_DESEJADA> npm run seed:flow
```

No PowerShell:

```powershell
$env:SEED_DEMO_PASSWORD='SuaSenhaForte123!'; npm run seed:flow
```

## Automacao sem clique (scheduler)

O backend agora processa sozinho as rotinas de contratos/financeiro:

- Ciclo diario completo (`AUTOMATION_DAILY_CRON`, padrao `0 5 * * *`)
- Ciclo horario leve (`AUTOMATION_HOURLY_CRON`, padrao `15 * * * *`)

Variaveis de controle:

- `AUTOMATION_ENABLED=true|false`
- `AUTOMATION_HOURLY_ENABLED=true|false`
- `AUTOMATION_TIMEZONE` (padrao `America/Sao_Paulo`)
- `AUTOMATION_PREVENTIVE_DAYS_AHEAD` (padrao `45`)
- `AUTOMATION_RUN_ON_BOOT=true|false`

## Dados principais criados

- Cliente: `Cliente Demo Energia S.A.` (`12.345.678/0001-90`)
- Obra: `Obra Hospital Central`
- Equipamento: `Gerador Hospital Principal` (`DEMO-GMG-0001`)
- Oportunidade: `Projeto de continuidade energetica - Bloco Cirurgico`
- Vistoria: `VIS-DEMO-0001`
- Proposta: `90001/00` (status `WON`)
- Contrato: `CTR-90001` (ativo)
- O.S.:
  - `OS DEMO - Troca de filtros corretiva`
  - `OS DEMO - Preventiva contratual mensal`
- Pedido de compra: `PO-90001`
- Centro de custo: `CC-DEMO-CONTRATO` e `CC-DEMO-GERADOR`

## Roteiro de validacao por modulo

1. Comercial/CRM
- `Funil de Vendas`: conferir oportunidade em `NEGOTIATION`.
- `Vistorias Comerciais`: conferir `VIS-DEMO-0001` em `COMPLETED` com anexo.
- `Propostas`: abrir `90001/00` e validar itens/valor.

2. Contratos
- Abrir `CTR-90001` e validar equipamentos, faturas e cronograma preventivo.

3. Operacoes e Despacho
- Em `Agenda / Painel de Despacho`, validar O.S. abertas e tecnico sugerido.
- Testar `Despacho rapido` para mover O.S. para `IN_PROGRESS`.
- Em `Ordens de Manutencao`, validar status atualizado.

4. Ativos
- Em `Equipamentos`, abrir `Gerador Hospital Principal` e validar cliente/modelo/local.

5. Suprimentos e Estoque
- `Catalogo`: validar itens demo (`DEMO-FILTRO-001`, `DEMO-SERV-PM-001`, `DEMO-EPI-001`).
- `Inventario`: validar saldo e reservas.
- `Pedidos de Compra`: validar `PO-90001` e recebimento parcial.
- `Fornecedores`: validar `Fornecedor Demo Power`.

6. Financeiro
- `Contas a Receber`: validar titulo de contrato (parcial) e O.S. avulsa (aberto).
- `Contas a Pagar`: validar titulo do pedido `PO-90001`.
- `Fluxo de Caixa`: validar projecoes carregadas.
- `Contas Bancarias`: validar conta `Conta Operacional Demo`.
- `Centros de Custo`: abrir DRE de `CC-DEMO-CONTRATO`.

7. RH e Administrativo
- `Colaboradores`: validar usuarios demo (comercial, tecnico, operacao).
- `EPIs e Ferramentas`: validar entrega de `Capacete classe B - Demo`.
- `Banco de Horas`: validar apontamento do tecnico demo.
- `Comissoes`: validar comissao vinculada ao recebivel do contrato.
- `Frota`: validar veiculo `DEM-9010`.

## Usuarios demo criados/atualizados

- `vendas.demo@manitec.local`
- `tecnico.demo@manitec.local`
- `operacao.demo@manitec.local`

Senha: valor de `SEED_DEMO_PASSWORD` (ou fallback para `SEED_ADMIN_PASSWORD`/`SEED_MASTER_PASSWORD`).
