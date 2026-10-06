# Etapa 03 — Ensaio CRM → operação → financeiro

Data: 06/10/2026. Ambiente: PostgreSQL efêmero `gridone_stage3_stage` em `127.0.0.1:5545`, API em `127.0.0.1:3100` e frontend em `127.0.0.1:3101`. O banco operacional `gridone_db` não foi usado. Automação agendada e integrações de envio foram desativadas. Todos os clientes, CNPJs emitentes, contas e itens adicionais deste ensaio são fictícios.

## Resultado reproduzido

- Bootstrap do banco vazio: 97/97 migrations registradas; `db:preflight` passou. O seed completo e o seed dos 12 clientes passaram.
- 12/12 fluxos da matriz de API passaram, cobrindo peça de máquina, peça avulsa, serviço do catálogo, horas de assistente e técnico júnior, propostas mistas e contrato. Cada caso passou por oportunidade, tarefa com prazo, proposta, aprovação, pedido/OS/contrato, entrega/execução, título e conferência de duplicidade.
- 8/8 verificações adicionais passaram: baixa de parcela contratual, rascunhos fiscais NF-e/NFS-e, remessa CNAB 240 simulada de convênio não homologado, validação cliente/equipamento, aceite por link, revisão financeira sem vencimento e bloqueio de baixa financeira pelo comercial.
- 2/2 exceções passaram: cancelamento libera reserva sem criar cobrança; entrega parcial seguida de encerramento cobra somente a quantidade entregue.
- 3/3 testes Chromium passaram: aprovação no portal e conversão em contrato, rejeição do cliente e aceite por link seguro.
- Reconciliação independente dos 12 casos passou: propostas totalizam **R$ 37.944,50**; os títulos avulsos vinculados aos 11 casos que não são contrato totalizam **R$ 31.144,50**. O caso restante é contratual e possui parcelas e vínculo próprios. Identificadores de oportunidade, proposta, pedido/OS, cliente e títulos foram comparados com o banco; as somas dos títulos avulsos batem com as propostas.

Evidência detalhada: [matriz de API](etapa-03-auditoria-resultados.json), [exceções](etapa-03-excecoes-resultados.json) e [reconciliação](etapa-03-reconciliacao-resultados.json).

## Falhas encontradas e corrigidas

1. O bootstrap da etapa 02 criava o esquema com `prisma db push`, mas deixava sem default os códigos automáticos de usuários, clientes e geradores. O primeiro `seed:flow` falhou com `Null constraint violation: users.code`. O script de bootstrap passou a instalar as sequências e defaults da migration histórica. O banco foi descartado e reconstruído do zero; o seed e o preflight passaram.
2. O roteiro antigo de auditoria usava perfis de pagamento sem CNPJ emitente e enviava um campo antigo ao convênio Santander. Os fixtures foram atualizados para a validação atual, com perfis separados por finalidade e emitente fictício correspondente.
3. O teste de navegador de contratos criava proposta sem perfil de pagamento e escolhia qualquer item do catálogo. Ele agora seleciona um serviço ativo e um perfil de pagamento de serviços pela API. Os três testes da suíte passaram após a atualização.

## Limites e decisão

**A etapa 03 ainda não recebe aceite integral.** Este foi um ensaio local isolado, porque não há evidência de um staging remoto completo conforme a etapa 02. Também não existe um fluxo próprio de **devolução de peça já entregue** no módulo de pedidos de venda. Uma devolução precisa registrar entrada de estoque, vínculo com a entrega e tratamento do título, sobretudo se já houve pagamento, boleto ou nota. Uma simples correção manual de estoque perderia essa rastreabilidade. Esse cenário fica aberto para implementação e teste antes do aceite da etapa.

O ensaio de CNAB verificou apenas geração de arquivo de 240 posições e bloqueio de envio de convênio não homologado. Não houve envio ao Santander, importação de retorno real, emissão fiscal nem movimentação bancária real; esses aceites pertencem às etapas 04 e 05. Os rascunhos fiscais usados neste ensaio não são notas emitidas.

## Repetição segura

1. Criar um PostgreSQL descartável com banco `gridone_stage3_stage`, porta local 5545 e credenciais próprias de teste.
2. Executar `npm run db:bootstrap:staging` com `NODE_ENV=staging`, `BOOTSTRAP_FRESH_STAGING_DB=yes`, `BOOTSTRAP_TARGET_DB_NAME=gridone_stage3_stage` e `DATABASE_URL`, `DB_NAME`, `EXPECTED_DB_NAME` apontando para esse banco vazio.
3. Executar `npm run seed:flow` com senha demo e storage local de teste; depois `node scripts/seed-stage3-fictional-clients.cjs` com `STAGE3_CONFIRM_FICTIONAL_SEED=yes`.
4. Subir API e frontend em 3100/3101, com `AUTOMATION_ENABLED=false` e integrações de envio desativadas. Executar `node scripts/audit-commercial-flow.js --prepare --inspect`, depois sem argumentos e com `--exceptions`; por fim, `node scripts/reconcile-stage3-flow.cjs`.
5. Rodar `npm run e2e -- e2e/commercial-contract-finance.spec.ts --project=chromium` pelo runner seguro, apontando explicitamente para as portas locais e com `E2E_TARGET_ENV=staging`, `E2E_CONFIRM_STAGING=true`, `E2E_STAGING_HOST_ALLOWLIST=127.0.0.1`.

Todos os scripts de seed, auditoria e reconciliação usados aqui verificam nome e porta do banco de teste antes de gravar ou ler os dados fictícios.
