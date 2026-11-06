# Central de Propostas — fase 1

**Continuidade em 27/10/2026:** a revisão de UX passou a contar com navegador real: 24 rotas, quatro larguras e temas claro/escuro, além da renderização das duas páginas da prévia e da correção dos avisos técnicos. Resultados, evidências e limites estão em [Revisão de UX ADMIN](ux-admin-20261026-validacao.md). Essa cobertura não encerra V01–V30, o aceite dos emitentes ou a conferência dos modelos definitivos. **A implantação continua não aprovada**, inclusive pelas pendências de segurança e acessibilidade registradas no relatório atual. Os pareceres datados abaixo são históricos.

> **Parecer da homologação final de 23/10/2026: REPROVADA PARA IMPLANTAÇÃO enquanto a validação visual e da experiência no navegador estiver pendente.** Testes de regras/API aprovados; homologação integral não concluída. Consulte a seção final e o [roteiro manual](propostas-fase1-roteiro-homologacao.md).

**Atualização de 26/10/2026:** o PRP seguinte refinou a classificação e a composição dos escopos, preservando as correções desta Fase 1. A regressão atual passou em 183 testes de backend, 32 testes puros da interface e 29 verificações HTTP no banco isolado. O [relatório do refinamento](escopos-refinamento-validacao.md) registra mudanças, evidências e limites. **A pendência de navegador continua aberta; a implantação permanece reprovada.** Os resultados datados abaixo são o histórico desta homologação.

Implementação local em 23/10/2026. Referência: `PRP_MANITEC_CENTRAL_DE_PROPOSTAS_FASE_1.md`. Diagnóstico anterior às alterações: [propostas-fase1-diagnostico.md](propostas-fase1-diagnostico.md).

## Escopo da entrega

A fase atua nas propostas de peças e serviços. Mantém as quatro etapas, o catálogo, a biblioteca técnica, o editor documental, as carteiras e o fluxo de aprovação existentes. As telas próprias de geradores, propostas externas e contratos continuam no caminho anterior. A biblioteca unificada de modelos do Studio permanece fora desta fase.

Não houve commit, push, aplicação de migração no banco principal nem troca dos servidores principais. Branch local: `work/proposals-phase1-20261023`.

## O que mudou

| Antes | Agora |
| --- | --- |
| O formulário precisava estar completo para ser gravado. | Rascunho de edição separado da proposta comercial: admite cliente e itens ainda incompletos, sem gerar código comercial, aprovação, O.S. ou recebível. |
| O preenchimento ficava em memória. | Gravação no sistema, cópia local por usuário/rascunho, recuperação e preservação da última edição ao navegar. Conflitos de versão retornam 409 e conservam o preenchimento. |
| O formulário limitava o desconto a 7% fixos. | A alçada vem das regras existentes. O vendedor pode preparar um desconto maior e solicitar aprovação; a API exige alçada suficiente para liberar. |
| A revisão dependia de mensagens dispersas. | Pendências tipadas por dados comerciais, itens, escopo, despesas, pagamento, descontos e documento, com retorno ao campo/etapa. Rascunho e ações decisivas têm bloqueios diferentes. |
| Havia cálculos monetários repetidos. | Domínio puro compartilhado entre interface e API. Soma decimal dos itens antes do arredondamento; despesas arredondadas por tipo; rateio de desconto em centavos, com residual determinístico. |
| Duplicatas dos conjuntos eram descartadas. | Conferência de todos os selecionados, independente da página de busca; somar quando item/preço forem iguais, separar com justificativa ou cancelar. Desfazer preserva o estado anterior. |
| Texto de pagamento podia esconder o plano real. | Resumo de entrada, saldo, parcelas, último centavo residual e datas informadas. Texto legado ambíguo é aviso; incompatibilidade estrutural comprovada bloqueia liberação. |
| Quantidades atípicas de despesa não tinham conferência configurável. | Avisos por tipo e quantidade no cadastro existente do Studio. Não se inferem equipe, dias ou erro pela razão despesa/serviço. |
| Prévia exigia documento já liberado. | Prévia interna do PDF usando os renderizadores do cliente, sem gravar entrega, publicar ou enviar. |
| Um novo download podia usar outro template. | Para aprovações desta fase, PDF, DOCX e dados públicos são congelados na mesma aprovação. Downloads posteriores usam os bytes aprovados. |
| Repetições podiam disputar gravação/transição. | Chave de gravação do rascunho, proteção de versão, promoção idempotente, bloqueio transacional das transições e chave de solicitação de envio. |

### Regras preservadas

- O servidor continua resolvendo preços de serviços, tarifas, emitentes, contas, elegibilidade comercial, carteiras e permissões.
- A validação fiscal do perfil de pagamento foi extraída para um único helper, usado pela gravação e pela conferência. O CNPJ do favorecido precisa coincidir com o emitente, como já exigido.
- A biblioteca técnica continua produzindo atividades somente a partir dos vínculos cadastrados. Materiais não contratam execução automaticamente. Ajustes ao escopo gerado exigem conferência interna rastreável; a alteração dos fatos invalida a conferência aplicável.
- A O.S. continua recebendo o texto aprovado e suas condições operacionais. Aceite com entrada pendente não libera execução. Peças seguem para pedido de venda; não há baixa de estoque pela simples aprovação.
- O resumo público, PDF, DOCX e dados do portal não recebem notas internas nem justificativas de conferência. A auditoria de conferência fica no servidor.
- Nenhuma aprovação, envio, publicação, recebimento ou movimentação operacional é executada ao salvar o rascunho ou abrir a prévia.

## Arquivos principais

- `backend/src/modules/proposals/proposal-review.domain.ts`: conferência e cálculo compartilhados; `frontend/lib/proposal-review.ts` apenas os exporta para a interface.
- `proposal-conference.ts`: adaptação dos dados da API, preços e políticas vigentes, dados salvos e auditoria.
- `proposal-editor.service.ts`, `proposal-editor.controller.ts`, `proposal-editor.dto.ts`: rascunhos próprios, permissões, tamanho, repetição e revisão.
- `proposal-payment-profile.ts`: regra existente de conta/emitente reutilizada.
- `proposals.service.ts`, controller, módulo e DTO: integração com criação, edição e transições existentes.
- `documents.service.ts`, controller, renderizadores visual/Word e geração: prévia sem entrega e documentos aprovados imutáveis.
- `deliveries.service.ts` e DTOs: proteção contra repetição da mesma solicitação; `customer-portal.service.ts`: resumo de pagamento e filtragem de observações de movimentos internos.
- `frontend/app/dashboard/proposals/new/`: revisão, recuperação, inserção/conferência de itens e formulário existente.
- `ProposalEditingDraftList.tsx`: últimos rascunhos próprios na carteira.
- `DocumentSharePanel.tsx`: impede clique simultâneo e conserva a chave da tentativa de envio.
- `studio.service.ts` e `developer/data/resources.ts`: conferência de despesas no cadastro de dados existente.
- `frontend/next.config.ts`: raiz do Turbopack ajustada ao domínio puro compartilhado, conforme documentação instalada do Next.

O inventário exato usado na validação fica em `runtime-logs/propostas-fase1/phase1-files.json`. Esse diretório contém evidências locais e não é destinado ao Git.

## Banco e ativação

Migração aditiva: `20261023190000_proposal_editing_drafts`.

1. `proposal_editing_drafts`: formulário em edição, proprietário, versão, chave/hash da gravação e contadores. Vínculo opcional à proposta; nenhuma alteração de nulabilidade nas relações comerciais.
2. `proposal_document_snapshots`: PDF, DOCX, dados públicos, modelo e autor da aprovação. Tabela separada para não carregar binários nas listagens. Limite de 20 MB por formato, alinhado ao armazenamento documental existente. Não é fila de envio.

Flag: `PROPOSAL_CONFERENCE_PHASE1=true`; desativada por padrão. A interface consulta a API e mantém o fluxo anterior quando a flag está desligada. Contratos nesta tela também mantêm o fluxo anterior.

Validação usa exclusivamente `gridone_proposals_f1_20261023`, restaurado de backup verificado. API de validação: porta 3005; frontend: porta 3002, diretório `.next-e2e`. `AUTOMATION_ENABLED=false` e `EXTERNAL_DELIVERIES_DISABLED=true` impedem automações e entregas externas nessa instância. O armazenamento também é separado.

Os servidores principais nas portas 3000/3001 e o banco `gridone_db` permanecem em uso com o build anterior.

## Evidências e comandos

Resultados finais de 23/10/2026. Os logs locais ficam em `runtime-logs/propostas-fase1/`.

| Verificação | Resultado |
| --- | --- |
| Backend: propostas, alçadas, pagamento/liberação financeira, documentos visuais/Word, portal, entregas e escopos | 18 suítes, 158 testes aprovados |
| Regras compartilhadas, conjuntos TOF/TM/TB e inserção de 12 selecionados no frontend | 24 testes puros aprovados |
| API real com PostgreSQL isolado | 18 fluxos aprovados |
| Build TypeScript e build pelo Nest CLI com assets | Aprovados, saída exclusiva em `dist-prp`, sem apagar diretórios |
| Build Next de produção | Aprovado, saída exclusiva em `.next-e2e` |
| ESLint dos módulos/arquivos afetados | Aprovado, sem erros ou avisos nos logs finais |
| `git diff --check` | Aprovado; apenas avisos informativos de conversão LF/CRLF do workspace |
| Smoke HTTP | 6 rotas com HTTP 200; proxy da porta 3002 confirmado no ambiente `test` |
| Integridade do sistema principal | 13 tabelas operacionais com contagens e hashes idênticos antes/depois; três administradores ativos preservados |
| E2E visual e acessibilidade no navegador | Não executado: a conexão de automação expirou, inclusive numa chamada mínima. Dois cenários preparados para 1366 e 390 px |

Os fluxos HTTP cobrem rascunho incompleto, recuperação, propriedade/carteira, retry, concorrência de edição e aprovação, recusa de alçada insuficiente por ação/PATCH, documento sem nota interna, congelamento de PDF/DOCX após alteração real de tarifa e publicação de outro template, envio com chave repetida, entrada pendente, pedido de venda sem baixa e O.S. com escopo aprovado mesmo após mudança de procedimento. Justificativa técnica interna também foi conferida como ausente do documento público.

As primeiras execuções identificaram expectativas antigas na base de testes do controller e na mensagem do vendedor. Foram ajustadas antes da rodada final. O teste de integração também corrigiu seus próprios fixtures de CNPJ/conta e a expectativa de HTTP 201 das ações POST; não se relaxou a validação fiscal para fazê-lo passar.

Arquivos de evidência: `backend-tests.json`, `backend-tests.log`, `frontend-pure-tests.log`, `api-results.json`, `api-tests.log`, `backend-build.log`, `nest-build.log`, `frontend-build.log`, `backend-lint.log`, `frontend-lint.log`, `main-before.json`, `main-after.json` e `smoke-results.json`.

Comandos executados incluem:

```text
prisma generate --schema runtime-prp/schema.prisma
prisma migrate deploy                       # somente no banco isolado
tsc -p tsconfig.prp.json                     # saída dist-prp; cliente Prisma isolado
nest build --config runtime-prp/nest-cli.phase1.json --path tsconfig.prp.json
next build                                 # E2E_DIST_DIR=1, API interna na porta 3005
jest --config runtime-prp/jest.json --runInBand <suítes afetadas>
playwright test proposal-conference-domain.spec.ts equipment-item-sets.spec.ts technical-scope-source.spec.ts
eslint <arquivos afetados>
node runtime-logs/propostas-fase1/verify-api.cjs
git diff --check
```

Os três arquivos Playwright acima são testes puros de regras, sem abrir navegador. Não devem ser apresentados como validação visual/E2E.

### Acesso para validação

Abrir `http://127.0.0.1:3002/dashboard/proposals` e entrar com a conta administrativa existente na cópia de teste. Esse endereço usa dados isolados, incluindo fixtures identificadas como F1; não é a instância principal. Nenhuma entrega externa está habilitada.

Inicializadores locais: `runtime-logs/propostas-fase1/start-backend.cjs` e `start-frontend.cjs`. PIDs e saídas dos processos também ficam nessa pasta. O Git permanece no commit `268398d`, com as alterações disponíveis apenas no workspace.

## Métricas instrumentadas

- `PROPOSAL_EDITOR_METRICS`: início/gravação de rascunho, cliques, edições, perfil, tipo e duração; `FIRST_READY` registra a primeira promoção apta.
- `PROPOSAL_CONFERENCE`: versão comercial, códigos/grupos de pendências, ajustes manuais e justificativas válidas. As alterações de fatos são reavaliadas.
- Movimentos e auditoria de status existentes continuam registrando devoluções e aprovações.
- `PROPOSAL_EDITOR_PROMOTION` registra somente identidade da proposta e hash do pedido, sem conteúdo do formulário.
- `PROPOSAL_DELIVERY_REQUEST` registra somente identidade do pedido/documento e hash; não armazena token público, destinatário ou conteúdo na telemetria.

Mediana/p90 e taxas comerciais precisam de uso real e período de observação. Os dados fictícios desta validação não comprovam ganho de produtividade. O marco inicial medido é a primeira gravação do rascunho no servidor, não o primeiro caractere digitado localmente.

## Decisões conservadoras e limites

- Duas empresas emitentes geram aviso dirigido. O plano agregado e a geração de recebíveis existentes foram preservados; não se inventou rateio fiscal entre CNPJs.
- Os limites padrão de conferência de alimentação e estacionamento são avisos, não proibições. Podem ser substituídos/desativados no Studio; não há dados suficientes para estimar pessoas/dias automaticamente.
- O congelamento documental começa nas aprovações desta fase. Não houve reconstrução/migração de templates de propostas históricas já aprovadas. Propostas históricas liberadas sem conferência desta fase não passam a exigir dispensas retroativas.
- A prévia Word depende do conversor já utilizado pelo sistema. Uma falha de conversão é informada; não se apresenta um modelo diferente como se fosse a prévia exata. O conversor foi detectado como disponível nesta máquina.
- O bloqueio de repetição de envio usa a nova chave opcional. Integrações antigas continuam aceitas. Se uma tentativa com chave já foi iniciada e a resposta se perdeu, a repetição retorna 409 e orienta consultar o histórico; não dispara de novo automaticamente.
- Há cópia local do preenchimento e gravação explícita no servidor. Uma cópia apenas local não equivale a rascunho disponível em outro computador. Recuperação com falha não substitui silenciosamente uma versão salva.
- A validação visual no navegador permanece pendente se a conexão de automação não estiver disponível. Há casos preparados em `frontend/e2e/proposal-phase1-workspace.spec.ts` para desktop e viewport menor, em zoom nativo.

## Rollback

Desativar a flag e restaurar o build anterior mantém as tabelas auxiliares e os dados de edição. Não apagar rascunhos, auditorias nem documentos aprovados para reverter código. A cópia anterior dos arquivos inicialmente alterados está em `runtime-logs/propostas-fase1/`; não sobrescrever trabalhos anteriores de interface/escopos presentes no workspace.

A migração não altera registros comerciais existentes. Não executar `migrate reset`, limpeza de usuários ou restauração de backup por cima do banco principal. A ativação na instância principal permanece uma etapa posterior à validação do usuário.


## Homologação final — 23/10/2026

### Parecer

**REPROVADA PARA IMPLANTAÇÃO nesta rodada. Homologação integral não concluída.** O bloqueio é a ausência de execução visual real em desktop 1366 px e mobile 390 px, zoom de 100%. Não há evidência para aprovar responsividade, teclado, acessibilidade, contraste, foco e recuperação completa pelo navegador.

A automação disponibilizada foi tentada novamente pela skill de navegador: uma conexão de 30 segundos e uma chamada mínima de 10 segundos expiraram, com reinicialização automática da sessão. Nenhuma página foi controlada, nenhum screenshot foi produzido e zoom/resoluções não foram verificados. Não se substituiu esse resultado por testes de regras executados no Playwright. Evidência local: `runtime-logs/propostas-fase1-homologacao/browser-attempts.json`.

O [roteiro manual](propostas-fase1-roteiro-homologacao.md) contém 30 casos, todos marcados como pendentes, para executar nas duas resoluções. Inclui as quatro etapas, temas claro/escuro, redes lentas/falhas, armazenamento indisponível, conjuntos, duplicidades, conflitos, alçadas, revisão, documentos, teclado e fluxos anteriores. Não houve simulação de aprovação humana dos casos.

### Revisão realizada e defeitos corrigidos

Foram revistos o relatório anterior, o domínio compartilhado, a persistência/recuperação de rascunhos, a navegação e conferência do formulário, inserção de itens, regras fiscais das contas, transições de aprovação, renderização/congelamento documental e programação de recebíveis. O workspace contém alterações anteriores de interface e escopos; foram preservadas. Esta rodada alterou somente os pontos de rascunho necessários, seus testes e a documentação de homologação, sem redesenho ou funcionalidade comercial adicional.

| ID | Defeito | Criticidade original | Correção e evidência |
| --- | --- | --- | --- |
| H01 | Na recuperação após outra aba salvar, a versão do servidor substituía a edição local na tela e a cópia divergente ficava escondida. | Alta — risco de perder trabalho do vendedor. | A edição local e sua revisão antiga são conservadas; o servidor continua rejeitando sobrescrita. Reabrir a versão do sistema é uma ação explícita, preservando a cópia local separada antes da troca. Regressão pura de recuperação aprovada; interação completa depende do caso V07 no navegador. |
| H02 | Um rascunho vinculado a proposta já concluída podia ser reaberto e gravado omitindo `proposalId`. | Média — edição obsoleta/incoerente. | Reproduzido por HTTP: GET e PUT retornavam 200 mesmo com a proposta WON. Agora a API usa o vínculo persistido, exige permissão de edição, rejeita proposta fora de DRAFT e impede trocar o vínculo. Verificação dentro da transação, com o mesmo bloqueio de escrita da proposta. Três testes de serviço e fluxo HTTP de regressão aprovados. A proposta comercial aprovada não era alterada pelo defeito. |
| H03 | A limpeza ao sair da página podia recriar o backup local que a conclusão acabara de remover. | Baixa — cópia local obsoleta. | A conclusão passa a impedir gravações atrasadas e gravações da limpeza de navegação. Teste puro aprovado; retorno pelo histórico ainda exige V10 no navegador. |

Arquivos de correção: `proposal-editor.service.ts` e seu novo spec; `useProposalEditingDraft.ts`, `draft-recovery.ts`, o controle de recuperação em `new/page.tsx` e `proposal-draft-recovery.spec.ts`. Cópias anteriores dos arquivos editados foram mantidas no diretório local de evidências.

O primeiro build desta rodada detectou uma inferência TypeScript inadequada no retorno do novo helper de recuperação. A tipagem foi explicitada e o build repetido passou. O lint identificou formatação no novo spec; foi corrigida e o lint repetido passou. O primeiro ensaio financeiro também ajustou sua expectativa de teste: a apresentação existente identifica os favorecidos por CNPJ, não pelo nome do cadastro do emitente. A regra do sistema foi mantida; os logs das tentativas foram conservados.

### Resultados após as correções

Evidências desta rodada em `runtime-logs/propostas-fase1-homologacao/`, separadas dos resultados anteriores. São arquivos locais ignorados pelo Git; não contêm credenciais de login nos resumos. Os PDFs de fixtures e eventuais diferenças de texto permanecem privados nesse diretório.

| Verificação | Resultado final | Evidência local |
| --- | --- | --- |
| Regressão backend: propostas, pagamento/alçadas, escopos, documentos, portal e entregas | **19 suítes / 161 testes aprovados**; repetidos após a correção transacional. | `backend-tests.json`, `backend.log`, `backend-result.json` |
| Frontend: domínio financeiro, TOF/TM/TB, seleção/inserção e recuperação | **28 testes puros aprovados**, incluindo 4 novos de recuperação; nenhuma página/browser fixture foi aberto. | `frontend.log`, `frontend-result.json` |
| HTTP real + PostgreSQL na cópia isolada | **22 fluxos aprovados**. | `api-results.json`, `api.log`, `api-result.json` |
| Build Nest com assets e cliente Prisma separado | Aprovado; saída somente `dist-prp`, sem apagar o build principal. | `build-backend.log`, `build-backend-result.json` |
| Build Next com checagem TypeScript | Aprovado; saída somente `.next-e2e`, API interna 3005. | `build-frontend.log`, `build-frontend-result.json` |
| ESLint dos arquivos da fase e novos testes | Backend e frontend aprovados, sem erros/avisos nos logs finais. | `lint-backend.log`, `lint-frontend.log` e resultados JSON |
| Saúde HTTP dos servidores/proxy e rotas da proposta | **6 rotas HTTP 200**; proxy isolado confirmado no ambiente test. Não comprova renderização autenticada. | `smoke-results.json` |
| Prévia e documento emitido | **56 entradas de texto visível do PDF comparadas, nenhuma diferença** no caso padrão ensaiado. Prévia após aprovação e download coincidem com os bytes congelados. | `document-comparison.json`, `document-inspection.json` |
| Confidencialidade | Canary de nota interna ausente dos dados públicos, do texto PDF e dos XMLs descompactados do DOCX inspecionado. | `document-inspection.json`, fluxo documental em `api.log` |
| Qualidade de diff | `git diff --check` aprovado. | `diff-check.log` |
| Desktop/mobile, zoom, teclado, acessibilidade e inspeção visual de documentos | **NÃO EXECUTADOS.** Falha de conexão da ferramenta. | `browser-attempts.json` e roteiro manual pendente |

Os 22 fluxos HTTP incluem os 18 cenários anteriores, a proteção de rascunho concluído e os três casos adicionais de emitentes/documento/recebíveis. Cobrem autenticação, carteiras, rascunho incompleto, retry, propriedade, concorrência, promoção sem duplicação, alçada, aprovação, entrega isolada com chave repetida, entrada pendente, pedido de venda sem baixa, escopo congelado na O.S. e justificativa técnica interna não exposta.

Os testes de navegador preparados em `frontend/e2e/proposal-phase1-workspace.spec.ts` continuam **não executados**. Não há aprovação automática de nenhuma das quatro etapas como experiência visual do vendedor. Carregamento, mensagens/foco, teclado móvel, contraste, sobreposições e perda de conexão/localStorage precisam do roteiro.

### Emitentes, recebíveis e documentos

O ensaio adicional utilizou duas empresas fictícias distintas na base isolada: conta PARTS da empresa A e conta SERVICES da empresa B, cada favorecido com documento igual ao respectivo emitente. Houve aviso dirigido de múltiplos emitentes. Foram recusadas contas inativas, de finalidade errada e com CNPJ divergente. Não se relaxou a regra para aceitar os fixtures.

Com peça de R$ 69,30 e serviço de R$ 440,00, o total foi R$ 509,30. A entrada de R$ 100,00 e o saldo em três parcelas geraram títulos de **R$ 100,00 + R$ 136,43 + R$ 136,43 + R$ 136,44**, total exato em centavos. Programação antes do aceite, datas fora de ordem e quantidade incorreta de vencimentos foram recusadas. Repetir a programação não criou novos títulos. Entrada pendente manteve a O.S. bloqueada.

**Limite preservado:** o plano de recebíveis é agregado e não ganhou divisão fiscal automática por CNPJ. O aviso não substitui a conferência da destinação pelo Financeiro. A implantação não pode ser apresentada como automação de rateio entre emitentes. Evidência: `cross-company-receivables.json`.

A comparação textual entre prévia antes de aprovar e PDF emitido cobriu o renderizador padrão no ensaio, incluindo itens, escopo e conteúdo financeiro. Os XMLs reais do DOCX também foram inspecionados. Alteração posterior de catálogo/tarifa e publicação de outro template não mudaram PDF/DOCX já congelados. **Isso não aprova paginação, aparência, cortes, impressão, leitura no celular ou modelos Word publicados específicos da operação**: V20–V22 continuam pendentes.

### Preservação da instância principal

- Nenhum commit, push, migração na base principal ou ativação em produção. Branch `work/proposals-phase1-20261023`; HEAD permanece `268398d`. Nenhuma alteração de flag/.env principal.
- Servidores principais preservados: API 3000/PID 11268 e frontend 3001/PID 8808, mesmos processos no final. Somente os servidores isolados foram reiniciados: API 3005/PID 15764 e frontend 3002/PID 2980. Evidência: `processes-final.json`.
- Os 22 fluxos gravaram exclusivamente em `gridone_proposals_f1_20261023`, com automações/entregas externas desativadas e armazenamento separado. Não houve nova migração nesta rodada nem regeneração do cliente Prisma principal.
- A comparação das **13 tabelas operacionais** usadas no ensaio anterior voltou a dar contagens/hashes idênticos; usuários e três administradores ativos preservados.
- A checagem ampliada inspecionou **155 tabelas principais**: **154 ficaram idênticas**, incluindo as tabelas comerciais/documentais e o histórico de migrações. `user_session_activities` manteve 47 registros, mas seu hash mudou. O código existente atualiza essa tabela a cada heartbeat de sessões (`lastSeenAt`, contador e outros metadados); a diferença é compatível com uso simultâneo do sistema, **sem prova de atribuição a uma sessão específica**, pois a referência guarda hashes, não cópias das linhas.
- A comparação estrita das 155 tabelas retornou falha e foi mantida como evidência; **não se declara imutabilidade integral da base**. Não houve tentativa de restaurar/reescrever a telemetria. Os scripts de conferência da base principal fizeram somente leituras e configuração da própria sessão de leitura.

Evidências: `main-before.json`/`main-after.json` (13 tabelas), `main-all-tables-before.json`/`main-all-tables-after.json` (155), `final-summary.json`. As alterações preexistentes no workspace e os documentos históricos não foram restaurados, removidos ou sobrescritos.

### Riscos restantes e condição para nova decisão

| Criticidade | Risco/pendência | Condição para encerrar |
| --- | --- | --- |
| Crítica | Nenhum defeito crítico confirmado nos ensaios executados. Isso não garante ausência em cenários não executados. | Manter bloqueio de implantação até fechar os itens abaixo. |
| **Alta — impeditiva** | Sem execução real de desktop 1366/mobile 390 a 100%; experiência das quatro etapas, foco/teclado, acessibilidade, responsividade e recuperação completa pelo navegador não comprovadas. | Executar V01–V30 nas duas resoluções, anexar evidências, corrigir impeditivos e repetir os casos afetados. |
| Média | Múltiplos emitentes mantêm recebíveis agregados; separação/destinação fiscal não é automática. | Financeiro conferir e aceitar o procedimento existente no caso V24–V25, sem supor rateio por CNPJ. |
| Média | Correspondência visual dos modelos Word efetivamente publicados, impressão/paginação e leitura móvel não comprovadas pelo ensaio textual padrão. | Executar V20–V22 com os modelos usados pela operação, além da comparação de conteúdo já aprovada. |
| Baixa | Clientes/integrações antigos que não enviam requestKey continuam sem a nova garantia de idempotência de envio; entregas externas reais não foram disparadas neste ambiente. | Manter a compatibilidade documentada; conferir a integração usada antes de depender dessa garantia. Não realizar disparos reais nesta homologação. |
| Informativa | Telemetria de sessões do ambiente principal variou durante a comparação ampliada. | Manter a ressalva e os hashes originais; não adulterar histórico para produzir igualdade artificial. |

**Próximo parecer somente após evidência visual/manual e aceite operacional dos emitentes.** A instância isolada permanece disponível para isso; esta rodada não autoriza publicação nem altera a decisão de manter produção sem ativação da Fase 1.
