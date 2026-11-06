# Revisão de UX ADMIN — Manitec GridOne

**Correção complementar em 27/10:** a investigação do download revelou que o PDF textual e o Word institucional podiam usar geradores diferentes. A geração foi unificada a partir do DOCX; para documentos já aprovados há uma cópia do Word com layout, mantendo o PDF histórico. Veja [PDF com o modelo do Word](pdf-modelo-word-validacao.md). Os resultados abaixo preservam a sequência da revisão anterior.

Implementação em 26/10/2026 e retomada da validação em 27/10/2026 (Brasília).

## Parecer

**Disponível para avaliação local no ambiente isolado. Implantação em produção ainda não aprovada.**

Foram corrigidos os dois defeitos P0, aplicada a padronização compartilhada e executada uma matriz de layout de 24 rotas. Isso não homologa todas as 119 rotas, todos os perfis ou todas as operações comerciais. As limitações e os riscos estão discriminados abaixo.

Sem commit, push, migração na base principal ou ativação em produção. Nenhuma proposta foi aprovada por esta revisão; nenhum documento foi enviado externamente.

## Escopo e ambiente

- Referências: os dois documentos de feedback fornecidos em 26/10 e as capturas em `imagens/outputs`, além do inventário `RESUMO_TELAS_E_FLUXOS_MANITEC.txt`.
- Frontend de teste: **http://127.0.0.1:3002**. Proxy da API apontado explicitamente para **127.0.0.1:3005**.
- Banco confirmado por `SELECT current_database()`: **gridone_proposals_f1_20261023**. `/api/health` confirmou `environment=test`.
- Automação agendada e entregas externas desabilitadas no inicializador isolado; armazenamento de teste separado.
- Branch mantida: `work/proposals-phase1-20261023`. O trabalho anterior foi preservado; o diff total do repositório inclui alterações de etapas anteriores.
- Evidências locais: `runtime-logs/ux-admin-20261026/`. Essa pasta está ignorada pelo Git e contém capturas, resultados e diagnósticos privados; não deve ser publicada integralmente.

## Defeitos P0: reprodução, causa e correção

### Prévia em branco

Reprodução na proposta fictícia **20025/00**, ID `36bbb32b-565c-4293-8e97-f2bdaac20ec0`. A API entregava HTTP 200, `application/pdf`, assinatura `%PDF-` e 7.042 bytes. O iframe nativo permanecia vazio no navegador integrado, sem apresentar erro recuperável. A geração do PDF estava funcionando; a falha reproduzida era sua apresentação pelo visualizador nativo.

Foi implantado um componente compartilhado de prévia com PDF.js, carregado sob demanda e com worker local. Ele renderiza os mesmos bytes do PDF em canvas, informa carregamento, sucesso ou erro, oferece nova tentativa, navegação de páginas, texto do documento e download. Há limite de espera para evitar um carregamento indefinido, além de limpeza dos recursos ao fechar.

Na repetição móvel de 27/10, o proxy registrou um `ECONNRESET` ao consultar o PDF e a interface apresentou HTTP 500. Foi acrescentada uma única repetição da **leitura GET** diante de falha de rede ou resposta temporária 500/502/503/504. Falha persistente gera instrução em português para tentar visualizar novamente, informando que o rascunho está salvo. Respostas de permissão não são repetidas. Gravação, solicitação de aprovação e envio ficam fora desse mecanismo. Os testes cobrem recuperação, preservação do 403 e limite de duas tentativas; não se afirma que a causa de infraestrutura foi eliminada.

Na edição do rascunho, a renderização pode ser conferida antes da aprovação. A central documental continua exigindo a liberação comercial existente. A interface só registra a prévia como renderizada após o callback de sucesso do visualizador.

Evidências: `before-preview-665.jpg`, `after-preview-665.jpg`, `p0-after.json`, `p0-check.log`. As duas páginas foram percorridas no navegador em 26 e 27/10. A consulta repetida em 27/10 confirmou que a prévia não modificou `updatedAt`, status ou quantidade de snapshots definitivos.

### Aviso técnico ausente na conferência

A revisão convertia apenas alertas técnicos de severidade `error`; o aviso `UNMAPPED_ITEM` ficava no snapshot técnico e desaparecia da conferência comercial. Agora erro, aviso e informação passam pela mesma regra de revisão, preservando sua severidade. Avisos não ganharam bloqueios comerciais novos.

Conferência e ficha técnica usam essa fonte compartilhada. A proposta de teste passou a mostrar **0 erros e 1 aviso**, coerente com seu snapshot. Ressalvas reconhecidas são apresentadas separadamente. Falha ou carregamento da conferência não produz indicação de prontidão.

O valor de referência permaneceu **R$ 521,28 de peça + R$ 489,76 de serviço + R$ 100,00 de despesas = R$ 1.111,04**. A proposta continua `DRAFT`.

## Alterações de interface e consulta

| Área | Alteração concreta | Proteção mantida |
| --- | --- | --- |
| Componentes compartilhados | Cabeçalhos mais compactos, indicadores recolhíveis, grades conforme espaço, foco visível e rótulos ligados aos campos | Indicadores e ações úteis continuam disponíveis |
| Navegação | Menu completo pesquisável em telas pequenas; barra inferior com Menu e até três destinos; link para pular ao conteúdo | Visibilidade continua derivada das permissões existentes |
| Fornecedores | Busca real no servidor por termos de nome, documento e contato; filtros de local e contato; ordenação, paginação e contador | `GET /suppliers` legado preservado; nova rota paginada usa a autorização já existente |
| Retorno da ficha | Filtros, página e ordenação de fornecedores persistem na URL; retorno restrito a caminho local válido | Nenhuma ampliação de acesso |
| Clientes e fornecedores | Cartões em telas pequenas, identificadores formatados apenas na apresentação, ações previsíveis | Dados originais preservados |
| Cadastro de cliente | Rótulos persistentes, seções navegáveis, opções avançadas agrupadas; condição de pagamento deixa de ser anunciada como UF | Validação e dados digitados preservados |
| Propostas | Carteira priorizada; rascunhos e acompanhamento em painel acessível; filtros nomeados | Recuperação, regras comerciais e ações existentes preservadas |
| Atendimento | Indicadores recolhíveis nas larguras menores; fila e busca ganham prioridade | Contadores e filtros por situação permanecem disponíveis |
| Oportunidades, compras e laudos | Criação por ação explícita, reduzindo formulários antes dos registros | Formulários existentes mantidos; sem nova regra de negócio |
| Equipamentos, catálogo, estoque, ordens e RH | Busca mais cedo, métricas compactas, títulos e controles padronizados | Sem alteração de saldos, vínculos ou atribuições |
| Catálogo e seleção de itens | Termos independentes e vocabulário explícito de sinônimos; seletores limitados a dez opções | Sinônimos não classificam serviço nem presumem compatibilidade técnica |
| Serviços na proposta | Identificação por código, descrição, preço e aplicação; compatibilidade desconhecida explícita; ajuda para validade opcional | Preços e obrigatoriedades existentes não foram alterados |
| Orientação | Títulos de Laudos, Minha rota e gestão de usuários ajustados; restrição técnica explicada com alternativa de consulta | ADMIN não passa automaticamente a atuar como técnico |
| Formatação | Funil, conversão e estoque passam a usar formatadores pt-BR compartilhados | Sem recálculo financeiro causado pelo layout |

Principais arquivos: `DashboardPageKit.tsx`, `CompactIndicators.tsx`, `admin-ux.css`, `dashboard/layout.tsx`, `TopBar.tsx`, `PdfPreview.tsx`, `EditOverlay.tsx`, `SuppliersWorkspace.tsx`, `usePagedList.ts`, `SelectField.tsx`, `proposal-review.domain.ts`, `suppliers.service.ts`, `catalogs.service.ts` e as telas indicadas no inventário local `changed-files.json`. A preparação do worker está em `frontend/scripts/prepare-pdf-worker.mjs`; o arquivo gerado é ignorado pelo Git.

## Verificações automatizadas

| Verificação | Resultado e alcance |
| --- | --- |
| Backend Jest | **23 suítes, 197 testes aprovados**; revisão, escopos, propostas, documentos, entregas, catálogo e fornecedores, usando mocks |
| Frontend — seis arquivos de testes | **40 testes aprovados**; regras, cálculos, conjuntos, recuperação, classificação, busca, preservação do cliente, limite de espera e repetição limitada da leitura do PDF. São testes de funções pelo runner Playwright, não 40 jornadas de navegador |
| API isolada | **12 verificações aprovadas**, repetidas em 27/10: autenticação, paginação, termos independentes, CNPJ, contatos nulos/vazios, limites, contrato legado, catálogo e proteção documental |
| TypeScript | Aprovado após os ajustes finais |
| ESLint dos arquivos alterados | Aprovado após os ajustes finais |
| Build backend isolado | Aprovado; saída `dist-prp`, sem substituir a saída do principal |
| Build frontend isolado | Aprovado; compilações e retestes finais registrados no resultado de build local |
| `git diff --check` | Sem erros de whitespace |

Os testes da API compararam contagens antes/depois: as consultas não criaram propostas, ordens, documentos definitivos ou fornecedores. A conferência calcula o resultado sem aprovar a proposta.

## Matriz de navegador

Navegador integrado real, operado por locators Playwright da ferramenta de navegador. Altura de trabalho **618 px**, larguras **390, 665, 1024 e 1440 px**, temas **claro e escuro** na paleta Neblina. Foram realizadas **192 combinações** de rota/largura/tema; as telas corrigidas ao final devem ser consideradas pela captura mais recente de sua combinação.

O resultado de layout significa: página carregada, sem transbordamento horizontal do documento e sem campos visíveis desprovidos de nome acessível na análise do DOM. Não significa que todas as operações, cores, estados de erro ou elementos fora da primeira dobra tenham sido homologados. Tabelas e quadros podem ter rolagem local sinalizada. Capturas e medidas por caso estão em `browser-coverage-final.json`.

| Rota | 390 C/E | 665 C/E | 1024 C/E | 1440 C/E |
| --- | --- | --- | --- | --- |
| `/dashboard` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/clients` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/clients/new` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/equipments` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/catalog` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/orders` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/dispatch` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/finance/cash-flow` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/hr/collaborators` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/management/users` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/developer/data` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/contracts` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/atendimento` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/documents` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/automation` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/reports` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/suppliers` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/inventory` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/purchase-orders` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/opportunities` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/relatorios-tecnicos` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/tecnico` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/notifications` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| `/dashboard/proposals` | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |

C/E: claro/escuro. ✓ indica somente a verificação de layout definida acima.

### Densidade e interpretação das medidas

As coordenadas são posições verticais em pixels CSS a partir do topo do viewport, com a página no início, em 665 × 618. A análise distingue busca e início do registro; não mede automaticamente se todo o cartão cabe na dobra.

- Equipamentos: busca a **356 px** e primeiro registro a **471 px** na versão validada. A captura intermediária anterior continha um campo sem rótulo e não serve como linha de base comparável de densidade.
- Fornecedores: antes sem busca na tela avaliada; agora busca a **231 px**, primeiro cartão a **383 px**.
- Clientes: busca a **257 px**, primeiro cartão a **408 px**.
- Catálogo: busca a **337 px**, primeira linha a **495 px**.
- Ordens: busca a **347 px**, primeira linha a **516 px**.
- RH: busca a **275 px**, primeiro registro a **531 px**.
- Propostas: busca a **325 px**, início do primeiro registro a **521 px** (antes do recolhimento, a busca estava a 1.573 px).
- Atendimento: busca de **591 para 399 px** após recolher indicadores em telas pequenas.

Dashboard é uma visão agregada com prioridades, não uma listagem simples; sua busca do quadro permanece depois desses blocos. Automação é uma tela de configuração e suas execuções ficam depois dos controles. Estoque, compras, contratos e laudos possuem estados sem registros na cópia usada; um resultado vazio não fornece uma coordenada de primeira linha. Em celular, a rolagem vertical continua necessária em algumas telas.

Não foi estabelecida uma linha de base cronometrada de tarefas com vendedores. Assim, não há alegação de ganho percentual de tempo, cliques ou produtividade. As medidas acima comprovam densidade; tempos de tarefa exigem uma sessão comparativa com roteiro e participantes.

## Preservação e uso paralelo do principal

O usuário confirmou que o sistema principal estava em uso durante os testes de 26/10. A comparação das 155 tabelas entre **15:56 e 16:53 de 26/10, Brasília**, encontrou 145 iguais e dez alteradas: sessões, automação, acessos/entregas de documentos, propostas e movimentos, oportunidades, auditoria, atividade de sessão e modelos visuais. A auditoria registrou atividade ADMIN no principal, incluindo aprovação e publicação de modelo. Isso foi esclarecido como uso paralelo; nenhum registro foi revertido.

As tabelas de usuários, financeiro, estoque, clientes e equipamentos permaneceram iguais naquele intervalo. **Não é possível atestar igualdade integral da base principal sob uso concorrente**, nem atribuir cada alteração apenas com uma comparação de hashes. Os diagnósticos privados preservam esse resultado, sem apresentar um falso teste de integridade aprovado.

Os processos principais foram preservados durante a validação de 26/10. Na retomada de 27/10, as portas locais 3000 e 3001 já não tinham serviços escutando; somente os serviços isolados foram iniciados. Nenhuma configuração principal ou migration principal foi aplicada nesta revisão.

## Riscos e pendências para implantação

| Criticidade | Pendência | Encaminhamento |
| --- | --- | --- |
| **Crítica** | O audit das dependências de produção aponta avisos críticos para o Next.js 16.3.8 já instalado | Atualizar em ambiente separado e executar regressão antes de implantar. Não substituir `node_modules` compartilhado com o principal durante esta revisão |
| **Alta** | Homologação comercial completa da Fase 1 e do refinamento de escopos permanece mais ampla que esta revisão visual | Executar os roteiros anteriores com responsáveis, incluindo emitentes diferentes, recebíveis, conflitos simultâneos e documento definitivo. A restrição atual proíbe aprovar propostas |
| **Média** | Matriz ADMIN não representa todos os perfis, 119 rotas, paletas, navegadores e leitores de tela | Ampliar a cobertura por prioridade e por perfil, sem conceder permissões para contornar restrições |
| **Média** | Verificação amostral de acessibilidade não certifica WCAG AA integral | Concluir leitor de tela, todos os estados de foco/erro, gráficos, imagens, gradientes e conteúdo dinâmico |
| **Média** | Ausência de experimento de produtividade antes/depois | Medir tarefas equivalentes com usuários reais, usando cliques, rolagens, erros e tempo |

O audit é uma avaliação de versão, não prova de exploração nesta instalação. O override `sharp` já está em 0.35.5; não se deve apresentar o aviso de otimização de imagens como uma RCE comprovada aqui. As recomendações e versões corrigidas devem seguir os avisos oficiais: [Next.js — cache e typed arrays](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) e [Next.js — otimização de imagens](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw).

## Roteiro complementar controlado

1. Na instância isolada, percorrer as quatro etapas sem aprovar: cliente/equipamento, peças, serviços e revisão; conferir preservação ao voltar.
2. Selecionar e retirar TOF/TM/TB, combinar seleção individual e conjunto, conferir quantidades e duplicidades. Não salvar dados fictícios na base principal.
3. Abrir duas sessões de edição e confirmar recuperação de rascunho e conflito sem sobrescrita silenciosa.
4. Conferir limites de desconto com perfis de teste existentes; não ampliar permissões. Validar despesas e parcelas com os valores de referência.
5. Em atividade de homologação autorizada separadamente, testar emitentes distintos para peça/serviço, recebíveis e aprovação; comparar o documento definitivo com sua prévia e confirmar ausência de observações internas.
6. Testar erro de rede e nova tentativa, campos obrigatórios, manutenção dos dados, Escape e retorno de foco dos diálogos.
7. Conferir rodapés no final de formulários, zoom real de 200%, ordem de Tab, leitor de tela e contraste de todos os estados.
8. Repetir os roteiros `propostas-fase1-roteiro-homologacao.md` e `escopos-refinamento-roteiro.md` no escopo restante. Esta revisão não substitui seus critérios de aceite.

## Evidências de interação adicionais

- Navegação do menu pesquisável executada em 390 px. A pesquisa encontrou Fornecedores. Escape primeiro limpou a busca; o próximo Escape fechou o menu e devolveu o foco a Menu. O ciclo completo de Tab permanece pendente de homologação; não foi marcado como aprovado.
- No cadastro de cliente, o texto fictício foi preservado ao alternar seções. O campo condição de pagamento foi anunciado corretamente. Salvar continuou desabilitado com dados obrigatórios ausentes; nenhum cliente foi cadastrado.
- O link de salto levou o foco a `main-content`. No fim do cadastro em 390 × 618, a parte inferior do botão Salvar estava a **427 px**, acima da barra inferior, que começava a **546 px**. Evidências: `client-form-footer-390.jpg` e `client-form-keyboard.json`.
- Na revisão da proposta em 390 × 618, o rodapé financeiro terminou a **534 px** e o botão de salvar a **522 px**, antes da barra de navegação a **546 px**. Não houve transbordamento horizontal. Evidências: `proposal-footer-390.jpg` e `proposal-footer-390.json`.
- Contraste amostral dos placeholders de busca/filtro de fornecedores: **5,23:1 no claro** e **8,20:1 no escuro**, acima de 4,5:1. Elementos com gradientes, transparência, desabilitados ou opacidade foram excluídos do cálculo. Isso não certifica o restante da interface. Evidência: `contrast-samples.json`.
- **Zoom real de 200% pendente:** o atalho Ctrl+Plus não alterou a escala do navegador integrado (`devicePixelRatio=1`, largura sem mudança). Não foi usada simulação CSS como substituto. Deve ser executado em navegador que permita confirmar a escala de 200%.
- Percorridas as quatro etapas do rascunho sem mudar suas quantidades, preço ou desconto. Peça R$ 521,28, serviço R$ 489,76, despesa R$ 100,00, total R$ 1.111,04. A conferência mostrou 0 erros, 1 aviso e prévia ainda não renderizada antes de abrir o PDF.
- A navegação revelou uma perda do registro completo do cliente quando a lista de busca era substituída. O detalhe canônico já consultado passa a ser mantido separado dos resultados, vinculado pelo ID, preservando os bloqueios comerciais. Foi acrescentado um teste de regressão para esse caso e para troca de cliente.
- Quantidades de peça/serviço receberam nomes acessíveis; linhas opcionais de horas e outros itens ganharam rótulos persistentes. A prévia recebeu referência explícita ao botão de origem para retorno de foco após o carregamento assíncrono.
- A consulta direta de `draft-preview` não altera proposta nem snapshots. O botão da interface mantém o comportamento existente de salvar o rascunho isolado antes de gerar a prévia; isso pode atualizar sua data. Não representa aprovação, publicação ou envio.
- Os retestes finais da edição e do retorno de foco são documentados em `proposal-steps-final.json` e `pdf-browser-final.json`. Somente os resultados efetivamente obtidos nesses arquivos devem ser considerados aprovados.
- Reteste do PDF em 27/10: duas páginas renderizadas, texto acessível das duas páginas conferido, cliente e total corretos, observação interna fictícia ausente e foco devolvido a **Visualizar proposta** após Escape. O documento definitivo aprovado não foi emitido nesta revisão.
- Após as correções, os quatro passos do rascunho apresentaram **zero campos visíveis sem nome acessível** e zero transbordamento horizontal; a revisão exibiu o cliente **Teste 2** corretamente.
- Reteste móvel na compilação final: viewport de **390 px**, janela de prévia com **366 px**, canvas de **285 px**, PDF renderizado e sem transbordamento horizontal da página. Escape devolveu novamente o foco a **Visualizar proposta**. Evidências: `preview-mobile-390.jpg` e `preview-mobile-390.json`. A falha de proxy observada anteriormente foi preservada nos logs, sem ser omitida do relatório.
- Compilação final aprovada, sem arquivos frontend alterados durante o build. Resultado consolidado em `verification-final.json`. O navegador foi devolvido ao tamanho normal e ao tema claro.

### Capturas para comparação local

[Antes: prévia em branco, 665 px](../runtime-logs/ux-admin-20261026/before-preview-665.jpg) · [Depois: PDF renderizado, 665 px](../runtime-logs/ux-admin-20261026/after-preview-665.jpg) · [Prévia móvel, 390 px](../runtime-logs/ux-admin-20261026/preview-mobile-390.jpg) · [Fornecedores no tema escuro](../runtime-logs/ux-admin-20261026/painel-suppliers-665-escuro.jpg).

As capturas são evidências locais, não uma publicação. O inventário desta rodada está em `ux-files-final.json`; o diff do Git também contém trabalho anterior preservado.
