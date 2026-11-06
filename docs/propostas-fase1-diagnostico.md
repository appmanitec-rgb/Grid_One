# Central de Propostas — diagnóstico da fase 1

Referência: PRP recebido em 23/10/2026. Escopo: propostas de peças e serviços; preservar contratos de API, carteiras, aprovação, financeiro, escopos e documentos existentes. Não implementar as fases 2–4. Sem commit/push, conforme orientação anterior do usuário.

## Implementação encontrada

- Next 16/React 19 em `frontend`; Nest 11/Prisma 5/PostgreSQL em `backend`. `frontend/AGENTS.md` exige consulta à documentação instalada do Next, realizada antes das alterações.
- Formulário: `frontend/app/dashboard/proposals/new/page.tsx`; quatro etapas e barra fixa em `components/ProposalFormFlow.tsx`. Estado em memória, carregamento por `editId`, gravação POST/PATCH ao final; não há recuperação persistente de formulário incompleto.
- `proposals.service.ts` recalcula preços e tarifas no servidor, normaliza itens e despesas, valida cliente/vendedor/equipamento, alçadas e pagamento; salva `commercialSnapshot` e movimentos. DTOs em `proposals/dto`. Aprovação e aceite possuem ações próprias no controller/service.
- Pagamento: `proposal-payment-plan.ts` no backend e equivalente frontend; presets CASH/50_50/30_70/PREPAID/CUSTOM/CONFIGURED; parcelas em centavos e residual na última. `ProposalPaymentProfile` representa conta/finalidade/emitente; não confundir um plano agregado com destinação financeira por emitente.
- Arredondamento vigente: subtotal dos itens somado antes do arredondamento monetário; despesas arredondadas por tipo; desconto geral monetário; saldo parcelado em centavos. Preservar essa ordem, corrigindo discrepâncias demonstradas por testes.
- Preços e alçadas: `auth/rules/commercial-access.ts`, regras de acesso detalhadas; o formulário ainda contém limite fixo de 7% para NORMAL.
- Despesas: `OperationalExpensesEditor.tsx`, tarifas de `operational-expense-rates`, cadastro em `developer/data/resources.ts`. Não há política explícita de conferência de anomalias identificada.
- Itens da máquina: `EquipmentItemsPicker.tsx` e `equipment-item-sets.ts`. Busca/paginação de dez itens, seleção global, grupos TOF/TM/TB, quantidades cadastradas e deduplicação por catálogo. Hoje duplicatas são descartadas sem escolha e sem desfazer a inserção.
- Escopos: módulo `technical-scopes`, vínculos por ID, prévia sem gravação, snapshot e versões auditadas; `TechnicalScopeGenerator.tsx` exige aplicação explícita. O.S. recebe a versão aprovada e registra condições operacionais separadamente.
- Documentos: `documents.service.ts`, `institutional-document.service.ts`, `proposal-pdf.service.ts` e editor visual/Word existentes. Documento comum exige liberação da diretoria; não existe uma prévia interna de rascunho equivalente à apresentação comercial. Portal recebe dados filtrados; histórico técnico interno é removido da resposta do cliente.
- Testes existentes: serviços/controllers de propostas, planos/liberação financeira, escopos e documentos; E2E de wizard, pagamentos, gerador, proposta externa, documentos e conversões.

## Problemas comprovados no código

1. Limite fixo de 7% no frontend diverge da alçada configurável do servidor e altera o desconto digitado silenciosamente.
2. `handleSubmit` executa validações finais antes de salvar e `prepareProposalItems` exige item. Cliente/vendedor são relações obrigatórias da proposta: tornar esses vínculos nulos ou inventar um cliente provisório seria indevido.
3. Estado de edição não possui persistência própria para recuperar campos ainda incompletos; tampouco uma proteção de versão no PATCH do formulário.
4. Inserção de conjunto filtra duplicatas silenciosamente e não mostra uma conferência global independente da página atual.
5. Subtotais financeiros usam operações de ponto flutuante em mais de um ponto. O cálculo de uma quantidade fracionária pode usar o valor original, embora a quantidade persistida seja truncada para inteiro.
6. Descrição livre/legada de pagamento e plano estruturado precisam ser distinguidos: não interpretar todo texto “A_VISTA” como contrato numérico inequívoco.
7. Não há um resultado tipado único de conferência agrupada por etapa/operação.

## Estratégia de implementação

- Regras puras compartilhadas, sem dependências de Nest ou banco no código consumido pela interface; autoridade de preços, autorização e transições permanece na API.
- Conferência incremental agrupada na etapa 4, com correção dirigida e operações distintas. Rascunho admite pendências; aprovação/emissão mantêm bloqueios proporcionais.
- Persistência auxiliar de edição, ligada ao usuário e opcionalmente à proposta existente. Necessária porque o formulário pode não possuir cliente/item; não representa uma segunda proposta comercial, não gera código, estoque ou financeiro. Controle de versão e chave de repetição preservam o conteúdo em retries e abas concorrentes.
- Reutilizar os registros de auditoria para métricas e decisões de conferência, registrando códigos/contagens e justificativas internas, sem valores sensíveis ou textos do cliente na telemetria.
- Preservar a política monetária e parcelamento existentes, com cálculo decimal/centavos determinístico e testes do exemplo do PRP.
- Conferência explícita dos selecionados, escolha para duplicatas e desfazer enquanto o formulário está em edição.
- Prévia interna usando o serviço/modelos documentais existentes e dados públicos sanitizados, sem envio/publicação automática.

## Riscos e proteção da validação

- Há alterações anteriores não commitadas em vários módulos; preservar todas e guardar cópias dos arquivos tocados nesta fase.
- Manter geradores/propostas externas no caminho atual, com novos campos opcionais e testes de regressão.
- Validar migrações e persistência exclusivamente em banco isolado. Não modificar registros comerciais existentes nem ativar mudanças na instância em uso durante a implementação.
- Não inferir regra de rateio por CNPJ nem autorizações operacionais; ausência de informação vira pendência dirigida.
- A conexão de navegador falhou na sessão anterior; tentar a ferramenta indicada pela skill antes de afirmar disponibilidade de validação visual/E2E.

## Rollback

Código: cópias anteriores em `runtime-logs/propostas-fase1/`, sem substituir alterações alheias. Banco: migração exclusivamente aditiva e testada isoladamente; tabelas auxiliares podem permanecer sem uso se a interface anterior for restaurada. Não apagar rascunhos/auditoria para reverter a ativação. Instância em uso permanece no build atual até validação/ativação explícita.
