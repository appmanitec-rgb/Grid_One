# Refinamento profissional dos escopos técnicos

**Continuidade em 27/10/2026:** a [revisão de UX ADMIN](ux-admin-20261026-validacao.md) corrigiu a prévia em branco e a divergência de avisos, com evidências reais de navegador. Isso não substitui a conferência técnica operacional nem os 15 casos deste refinamento. A implantação permanece não aprovada; os resultados abaixo preservam o histórico da etapa.

Implementação iniciada em 23/10/2026; integração e regressão concluídas em **26/10/2026**. Referência: PRP do anexo `3b248dbf-2d54-4a87-a3ce-4724d09ec892`.

> **Parecer: REPROVADO PARA IMPLANTAÇÃO enquanto as verificações de navegador e a conferência técnica operacional estiverem pendentes.** Implementação e testes automatizados concluídos no ambiente isolado. Homologação integral não concluída.

Diagnóstico anterior ao código: [escopos-refinamento-diagnostico.md](escopos-refinamento-diagnostico.md). Validação interativa pendente: [roteiro de 15 casos](escopos-refinamento-roteiro.md), complementado pelo [roteiro da Fase 1](propostas-fase1-roteiro-homologacao.md).

## 1. Entrega e uso pelo vendedor

O refinamento utiliza o motor e a biblioteca técnica existentes. Aplica-se às propostas de peças e serviços, mantendo as quatro etapas do formulário.

1. Selecionar cliente, equipamento, peças e serviços comerciais normalmente.
2. Em **Serviços → Finalidade e execução dos serviços**, conferir os vínculos existentes. Para serviço genérico ou horas, pesquisar um procedimento cadastrado ou informar finalidade e execução manualmente.
3. A seleção explícita substitui, somente nessa proposta e nesse serviço, os procedimentos e o pacote vinculados ao catálogo. Não altera o cadastro do catálogo. **Usar vínculo do catálogo** remove a substituição.
4. Conferir materiais, serviços definidos, pendências e condições de execução no resumo consolidado. O seletor reutiliza a busca existente e limita a dez opções visíveis.
5. Gerar, conferir e aplicar a prévia na própria etapa Serviços. O gerador existente continua disponível na Revisão. Não foram criadas etapas ou sobreposições adicionais para classificação.
6. Salvar rascunhos incompletos continua permitido. Aprovação/liberação exige resolver a finalidade e execução faltantes, conferir o escopo e respeitar as alçadas existentes.

As classificações fazem parte do rascunho, da versão técnica e do histórico da proposta. A descrição manual tem limite de 2.000 caracteres e um mínimo estrutural de 40 caracteres/seis palavras, com recusa de frases genéricas conhecidas. **Esse mínimo não comprova correção técnica:** a conferência humana e as permissões/aprovações existentes continuam necessárias.

## 2. Composição técnica e apresentação documental

| Fonte | Responsabilidade preservada |
| --- | --- |
| Catálogo e biblioteca técnica | Identidade dos itens, famílias, procedimentos executáveis, atividades, sequência, compatibilidade, materiais e condições de aplicação. |
| Composição técnica | Resolver vínculos explícitos, verificar requisitos, preservar quantidades/horas, agrupar atividades contratadas e produzir texto e seções estruturadas, com rastreabilidade. |
| Modelos visuais e Word existentes | Apresentação do documento, títulos/blocos documentais, formatação, identidade visual e campos dinâmicos. Recebem o escopo pelo campo documental existente. |

Os agrupamentos técnicos continuam acompanhados dos títulos definidos na biblioteca. O texto aplicado conserva esses agrupamentos; os modelos existentes compõem a apresentação do documento completo. Não foi criado outro gerador, editor ou cadastro de modelos, nem um mecanismo novo de personalização de cada subtítulo técnico por modelo.

O motor passou à versão **1.1.0** no caminho de peças e serviços:

- Fornecimento isolado informa materiais e quantidades, sem exigir ou incluir substituição.
- Serviços mostram finalidade/procedimentos contratados e suas quantidades ou horas. Seções vazias e a introdução burocrática automática foram removidas nesse caminho.
- A ausência de finalidade é uma pendência interna impeditiva. As frases automáticas de preenchimento citadas no PRP deixam de ser conteúdo final do novo caminho.
- Materiais não contratam intervenções. Volume de embalagem não determina capacidade de óleo. Não são incluídos materiais ausentes da venda.
- Atividades compartilhadas são deduplicadas com suas origens; linhas comerciais e quantidades permanecem identificadas.
- Testes com carga exigem contratação e continuam com condições operacionais pendentes. Selecionar um procedimento não autoriza a execução.
- Os textos iniciais novos de preventiva/corretiva descrevem inspeção/diagnóstico e distinguem reparos ou testes contratados separadamente.

**Biblioteca já cadastrada:** a instalação inicial é idempotente e não reescreve procedimentos existentes. Textos antigos genéricos podem exigir correção pelo responsável técnico ou uma classificação específica na proposta antes da liberação. Nenhuma atualização em massa foi aplicada à biblioteca principal.

## 3. Defeitos e riscos corrigidos

| Situação identificada | Correção e verificação |
| --- | --- |
| Serviço sem finalidade podia depender de o vendedor clicar em gerar escopo para ser conferido. | A conferência recalcula as pendências também no servidor, sem esse clique. Rascunho permanece permitido; tentativa de liberar, inclusive com dispensa forjada, é recusada. Verificado por HTTP. |
| Uma classificação explícita podia herdar procedimentos do pacote anterior, incluindo ensaios não selecionados. | A classificação substitui vínculo e pacote daquele serviço. Regressão específica comprova ausência do ensaio anterior. |
| Mudar horas/quantidade ou remover uma linha repetida podia reaplicar uma finalidade a fatos diferentes. | O servidor vincula a classificação a uma assinatura dos fatos e do contexto. Preserva o texto, sinaliza obsolescência e exige confirmação explícita para os fatos atuais. Testes de unidade e alteração real de horas via HTTP. |
| Serviço avulso no tipo comercial `OTHER` podia escapar do mínimo técnico. | No caminho de peças/serviços, item avulso sem catálogo é tratado tecnicamente como serviço. Regressão específica. |
| Requisições de prévia durante a digitação podiam interromper o preenchimento ou mostrar cartões do item anterior. | A digitação permanece habilitada durante a consulta; cancelamento e identidade da origem controlam a resposta. Classificação comercialmente antiga não é exibida como sendo de um novo item. Interação por teclado/foco ainda requer navegador. |
| Criação concorrente sob carga de build expirou a transação de cinco segundos (`P2028`). | Somente criação/edição do caminho Fase 1 usa espera máxima de dez segundos e execução de até trinta segundos. Idempotência e atomicidade preservadas. Rodada final HTTP aprovou a promoção concorrente sem duplicação. Não houve gravação parcial no ensaio que expirou. |

Uma falha de fixture também foi corrigida: o teste enviava preço/tipo de hora à prévia técnica, cujo DTO aceita apenas os fatos técnicos. A API corretamente recusou esses campos; o teste foi ajustado sem relaxar o DTO.

## 4. Compatibilidade e proteção dos dados

- Rascunhos, recuperação, conflitos de versão, cálculos, descontos, despesas, pagamento, emitentes e alçadas da Fase 1 foram preservados e reexercitados.
- A prévia técnica não grava proposta, O.S., financeiro ou entrega. Classificar um serviço não muda os preços ou o catálogo.
- O snapshot registra classificação, itens, quantidades/horas, definições e versões utilizadas, autor e conferência. Mudanças de finalidade invalidam a revisão aplicável.
- PDF/DOCX aprovados continuam congelados. Alterações posteriores de tarifa, procedimento ou modelo não alteram os documentos contratados.
- A O.S. recebe o escopo aprovado; a autorização operacional permanece separada. Entrada pendente continua bloqueando liberação. Venda de peças não baixa estoque pela aprovação.
- Notas e justificativas internas não são fontes do texto público. Foram verificadas no conteúdo público, PDF e XML do DOCX dos ensaios.
- Propostas já liberadas usam o snapshot salvo, sem recomposição retroativa. Uma proposta aprovada pelo motor 1.0.0 conservou o hash de origem e o PDF nos testes HTTP.
- O caminho legado de contratos manteve a estrutura anterior em teste unitário. Geradores, contratos e propostas externas não receberam uma interface nova neste refinamento. A verificação interativa desses caminhos permanece no roteiro manual.
- Não houve nova migração para este refinamento, alteração de `.env`, geração do cliente Prisma principal ou substituição dos builds principais.

## 5. Ambiente utilizado

| Item | Referência |
| --- | --- |
| Branch de desenvolvimento | `work/proposals-phase1-20261023` |
| HEAD preservado | `268398d` |
| PostgreSQL isolado | `gridone_proposals_f1_20261023` |
| API de teste | `http://127.0.0.1:3005`; saída `backend/dist-prp` e cliente `backend/runtime-prp/client` |
| Interface de teste | `http://127.0.0.1:3002`; saída `frontend/.next-e2e` |
| Proteções do ensaio | Ambiente `test`, Fase 1 habilitada, automações desligadas, entregas externas desabilitadas e armazenamento separado. |
| Principal preservado | API 3000 e interface 3001, mesmos processos/builds anteriores; banco `gridone_db`. |

O início da API isolada na retomada levou mais que a janela de prontidão do primeiro ensaio. Nenhum cenário daquela tentativa foi declarado aprovado. Após saúde HTTP 200 confirmada, a rodada completa foi executada novamente e passou.

Não houve commit, push, migração na base principal ou ativação em produção. As alterações preexistentes do workspace foram conservadas; os arquivos existentes receberam cópias antes deste refinamento.

## 6. Resultados finais

| Verificação | Resultado e limite |
| --- | --- |
| Backend, última execução em 26/10 | **21 suítes / 183 testes aprovados**: propostas, escopos, liberação/pagamentos, documentos, portal e entregas. Inclui os novos testes do refinamento e regressões anteriores. |
| Funções da interface em 26/10 | **32 testes aprovados** pelo executor Playwright: domínio de conferência, TOF/TM/TB, inserção, recuperação, hashes e classificação. São testes puros, sem abrir navegador. |
| API real/PostgreSQL em 26/10 | **29 verificações aprovadas**, incluindo autenticação/carteira, rascunhos, concorrência/idempotência, descontos, aprovação, documentos congelados, escopo na O.S., múltiplos emitentes e sete novos cenários do refinamento. A contagem inclui a verificação final da integridade principal. |
| Nest/TypeScript isolado | Build aprovado em 23/10 após as alterações semânticas do backend. A retomada de 26/10 utilizou esse build e repetiu os testes sobre o código atual; não houve alteração semântica posterior do backend. |
| Next/TypeScript isolado | Build final aprovado em 26/10, incluindo a última revisão do texto da interface. Interface isolada reiniciada com esse build. |
| Lint de arquivos afetados | Backend e frontend aprovados em 26/10, sem erros/avisos nos logs finais. |
| Prévia × PDF emitido | Na proposta de duas empresas testada, **56 trechos de texto extraídos, zero diferenças**. Comparação de conteúdo; não comprova posicionamento, quebra de página ou aparência. |
| DOCX | XML inspecionado; marcadores de notas internas ausentes. PDF/DOCX congelados também mantiveram seus bytes após mudanças posteriores de modelo/tarifa. |
| Smoke HTTP | Seis URLs locais com HTTP 200; proxy 3002 confirmado como ambiente `test`. Resposta HTTP não comprova a tela autenticada renderizada. |
| `git diff --check` | Aprovado. Avisos de conversão LF/CRLF são informativos. Branch e HEAD preservados. |
| Navegador real | **Indisponível.** O bootstrap de `mcp__node_repl__js` expirou em trinta segundos e reiniciou o kernel em 26/10. Nenhuma captura ou interação foi obtida. |

### Cobertura dos quinze cenários do PRP

| Cenário | Evidência automatizada |
| --- | --- |
| 1. Filtro isolado | Fornecimento sem procedimento/substituição. |
| 2. Óleo e filtros sem mão de obra | Quantidades reais e nenhuma capacidade presumida. |
| 3. Óleo/filtros com mão de obra | Somente procedimentos de troca contratados. |
| 4. Hora sem classificação | Pendência impeditiva, rascunho permitido; recusa real da liberação mesmo sem gerar ou tentando dispensar a pendência. |
| 5. Hora com procedimento | Horas, finalidade e origem persistidas; aprovação e congelamento documental reais. |
| 6. Inspeção preventiva sem material | Atividades de inspeção, sem seção de fornecimento. |
| 7. Bateria | Substituição contratada e condições próprias, sem tensão inventada. |
| 8. Pré-aquecedor | Instalação correspondente, sem ensaio de carga adicional. |
| 9. Teste sem carga | Não inclui teste com carga. |
| 10. Teste com carga | Continua condicionado à autorização operacional. |
| 11. Repetidos/compartilhados | Atividades deduplicadas; quantidades/linhas preservadas. Remoção de repetido invalida classificação anterior. |
| 12. Alteração após revisão | Mudança de finalidade/hash e de horas exige nova conferência. Texto anterior preservado. |
| 13. Versão aprovada | Snapshot anterior intacto; PDF/DOCX e O.S. mantêm versão contratada. |
| 14. Informações internas | Marcadores internos ausentes do escopo e documentos públicos testados. |
| 15. Compatibilidade | Contratos no motor legado, hash/documento aprovado 1.0.0 e regressões da Fase 1. Navegação real dos outros tipos permanece pendente. |

Essas evidências não substituem os quinze casos interativos do roteiro, todos ainda pendentes em desktop **1366 × 768** e mobile **390 × 844**, zoom **100%**.

### Integridade da base principal

A comparação somente leitura abrangeu **155 tabelas** antes/depois da retomada de 26/10:

- **154 tabelas com contagens e hashes idênticos**, incluindo usuários, documentos e registros operacionais.
- A única diferença foi o hash de `user_session_activities`; manteve **47 registros**. É uma tabela de telemetria de sessões do sistema que permaneceu ligado. A causa exata de cada alteração de linha não foi auditada; não se declara igualdade de todas as 155 tabelas.
- A verificação HTTP também comparou separadamente as treze tabelas operacionais críticas e confirmou os **três administradores ativos**. A tabela de usuários manteve seu hash.

O script de igualdade estrita das 155 tabelas retornou falha por essa diferença de telemetria. A ressalva foi mantida nas evidências, sem modificar registros para forçar o resultado.

### Evidências e reprodução

Diretório local ignorado pelo Git: `runtime-logs/technical-scopes-refinement/`. Contém cópias anteriores dos arquivos, resultados, logs e fixtures privados. Não publicar PDFs, dados de clientes ou credenciais desse diretório.

- `backend-tests.json`, `backend.log` e `backend-result.json`.
- `frontend.log`, `frontend-result.json`, resultados de lint/build.
- `api-results.json`, `api.log`, `document-inspection.json` e `document-comparison.json`.
- `main-all-tables-before.json`, `main-all-tables-after.json`, `final-evidence.json` e `browser-attempts.json`.
- Evidências anteriores à retomada preservadas em `evidence-before-resume-20261026/`.

Comandos usados, a partir da raiz do repositório:

```powershell
node runtime-logs/technical-scopes-refinement/run-check.cjs backend
node runtime-logs/technical-scopes-refinement/run-check.cjs frontend
node runtime-logs/technical-scopes-refinement/run-check.cjs api
node runtime-logs/technical-scopes-refinement/run-check.cjs lint-backend
node runtime-logs/technical-scopes-refinement/run-check.cjs lint-frontend
node runtime-logs/technical-scopes-refinement/run-check.cjs build-backend
node runtime-logs/technical-scopes-refinement/run-check.cjs build-frontend
git diff --check
```

O ensaio de API exige a instância isolada pronta e cria dados de teste exclusivamente nela. Os scripts de build direcionam saídas para `dist-prp`/`.next-e2e`; não usar comandos de migração ou reinício do principal para reproduzir esta validação.

## 7. Arquivos deste refinamento

Inventário comparado ao checkpoint inicial: **21 arquivos de código/testes alterados ou adicionados**. O hook `new/useProposalEditingDraft.ts` foi incluído na inspeção, mas permaneceu idêntico ao checkpoint.

| Área | Arquivos |
| --- | --- |
| Tipos e composição | `backend/src/modules/technical-scopes/technical-scope.types.ts`, `technical-scope.engine.ts`, `technical-scope.defaults.ts` |
| Classificação e resolução | `technical-service-classification.ts` (novo), `technical-scope-resolution.ts`, `technical-scope.dto.ts`, `technical-scopes.service.ts`, no mesmo diretório |
| Persistência técnica | `backend/src/modules/technical-scopes/technical-scope-integration.ts` |
| Conferência e proposta | `backend/src/modules/proposals/proposal-conference.ts`, `proposal-review.domain.ts`, `proposals.service.ts`, `proposal-editor.service.ts`, `dto/create-proposal.dto.ts` |
| Testes backend | `backend/src/modules/technical-scopes/technical-scope-refinement.spec.ts` e `technical-service-binding.spec.ts` (novos); ajuste da expectativa em `technical-scope.engine.spec.ts` |
| Interface | `frontend/app/dashboard/proposals/TechnicalServiceClassificationPanel.tsx` (novo), `TechnicalScopeGenerator.tsx`, `new/page.tsx`, `frontend/lib/technical-scopes.ts` |
| Teste frontend | `frontend/e2e/technical-service-classification.spec.ts` (novo) |
| Documentação | Este relatório, diagnóstico e roteiro do refinamento; notas de atualização no guia do gerador e na validação da Fase 1. |

Os demais arquivos já modificados no workspace pertencem às entregas anteriores; não foram descartados ou tratados como alterações exclusivas deste PRP.

## 8. Pendências, riscos e parecer

| Criticidade | Risco restante | Condição para encerramento |
| --- | --- | --- |
| **Alta — bloqueia implantação** | Não há evidência visual/funcional no navegador: quatro etapas, seleção, foco/teclado, carregamento/erro, conflitos/recuperação, claro/escuro, mobile e prévia. | Executar e registrar os quinze casos deste refinamento e os casos aplicáveis da Fase 1 nas duas resoluções, com zoom 100%. Corrigir defeitos e repetir regressões. |
| **Alta — bloqueia uso operacional dos procedimentos não conferidos** | Procedimentos existentes não foram reescritos. Textos genéricos podem impedir liberação; validação estrutural de descrição manual não certifica execução segura. | Responsável técnico aprovar os vínculos, finalidades, atividades e condições efetivamente usados pela empresa. Não dispensar essa análise por um serviço ter texto suficiente em comprimento. |
| **Média** | Comparação textual/XML não cobre tipografia, paginação, imagens e todos os modelos Word/visuais da empresa. | Conferir visualmente prévia, PDF e DOCX com os modelos adotados, incluindo materiais, serviços e duas empresas. |
| **Média — preexistente** | Emitentes distintos continuam com plano de recebíveis agregado; não há rateio fiscal automático por CNPJ. | Financeiro validar a destinação no fluxo existente. O aviso não representa divisão fiscal automatizada. |
| **Baixa** | Hash da telemetria de sessões mudou enquanto o principal permaneceu em funcionamento. | Manter a ressalva de integridade; não confundir com alteração dos registros comerciais ou igualdade integral do banco. |

**Conclusão:** código e verificações automatizadas concluídos para avaliação na instância isolada. A implantação permanece reprovada até encerrar as pendências de alta criticidade. Não houve autorização presumida para produção nem declaração de homologação visual concluída.
