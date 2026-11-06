# Correções da auditoria UX ADMIN — validação de 05/11/2026

**Parecer: correções aprovadas no ambiente isolado, com ressalvas para implantação.** Não constitui certificação integral do ERP nem autorização de envio comercial com cadastro fiscal incompleto. O sistema principal não recebeu build, migração, reinício ou ativação nesta tarefa. Nenhum commit ou push foi executado.

Referência: [auditoria original](auditoria-ux-admin-20261104.md) e [critérios de implementação](auditoria-ux-admin-20261104-implementacao.md). A auditoria original permanece como registro do estado anterior.

- Interface de validação: **http://127.0.0.1:3004**; API isolada: **3006**.
- Banco: `gridone_proposals_f1_20261023`. Scripts conferem nome do banco e ambiente `test` antes das operações. Automações e entregas externas desabilitadas.
- Navegador Chromium/Playwright real, **1366 × 900** e **390 × 844**, DPR 1, zoom 100%, claro e escuro. Neblina na matriz completa; Marfim, Mineral e Grafite também conferidos nos componentes do almoxarifado.
- **122 telas ADMIN, incluindo as 28 tabelas Studio, em quatro combinações: 488 cenários.** Retestes substituem as capturas das rotas afetadas pelas últimas correções. As 145 entradas inventariadas incluem aliases e áreas de outros perfis; estas não são contabilizadas como telas ADMIN homologadas.

[Galeria antes/depois](evidencias/ux-correcoes-20261105/galeria.html) · [Matriz CSV](evidencias/ux-correcoes-20261105/matriz.csv) · [Matriz detalhada](evidencias/ux-correcoes-20261105/matriz.json) · [Evidências e resultados](evidencias/ux-correcoes-20261105/README.md).

## Correções e aceite

| Achado | Resultado aplicado | Evidência de validação |
|---|---|---|
| UX01 — datas no dia anterior | Formatador compartilhado para datas de calendário, distinto dos horários dos eventos. Aplicado a contratos, propostas, documentos, vencimentos e outras fichas afetadas, sem mudar datas gravadas. | Contrato 04/11/2026–04/11/2027 e proposta válida em 18/11/2026 preservam o dia; testes em São Paulo, UTC e Auckland, dias inválidos e ano bissexto. |
| UX02 — indicador estreito | Invólucro específico para os indicadores departamentais; a regra de grade deixa de criar quatro colunas dentro do cartão. | Cartão de vencimentos passou de **69,1 px para 300,5 px** no desktop. Conferido em 390 px e quatro paletas. |
| UX03 — Locais | Contagens e até dois clientes por linha, consulta contextual pesquisável com até dez resultados, paginação e cartões móveis. “Sem local definido” explica equipamentos sem instalação vinculada. | Primeira linha passou de aproximadamente **741 px para 119,6 px**; busca e fechamento por Esc conferidos. Agrupamentos e consultas existentes preservados. |
| UX04 — campos sem nome acessível | Associação dos rótulos de filtros, catálogo, EPI, empresa, monitoramento, faturamento, compartilhamento e upload da marca do cliente. | Nenhum campo visível sem nome acessível no coletor final das 488 combinações; verificação dirigida em 12 rotas. Isso não equivale a auditoria WCAG completa. |
| UX04B — diálogo PDF | Diálogo nativo com fundo inerte, identificação, contenção de foco, Esc, bloqueio de rolagem e retorno ao botão de abertura. Referência explícita preserva o disparador mesmo quando fica desabilitado durante a consulta. | **30 movimentos de Tab/Shift+Tab por cenário**, quatro páginas navegadas, Esc e retorno de foco: claro/escuro × desktop/celular. |
| UX05 — contraste | Texto secundário e cabeçalhos do atendimento com token mais escuro no modo claro. Papel e identidade dos documentos preservados. | Nenhum candidato de contraste insuficiente nas quatro capturas da Central de Atendimento. Candidatos do coletor em cabeçalhos documentais com gradiente foram conferidos visualmente; a estimativa automática de fundo era incorreta. |
| UX06 — Studio | Resumo compacto de total/filtrados; colunas no próprio controle; uma paginação compartilhada. Formatação pt-BR apenas na apresentação. | 28 tabelas percorridas; uma paginação confirmada. Exportação CSV, ocultar/restaurar coluna e busca conferidos no navegador. CSV mantém códigos, precisão e zeros à esquerda, separado dos rótulos e valores monetários de exibição. |
| UX07 — colaboradores | Painel completo mantido na entrada; páginas filhas com cabeçalho e navegação compactos, indicando a seção atual. | Controle, documentos, criação e permissões em quatro combinações, sem mudar políticas ou opções de acesso. |
| UX08 — orientação e formato | Títulos derivados da navegação, com identificação de Documentação, Conciliação, Extrato e Equipe; rótulos de negócio para tarifas, moeda e números pt-BR. Ajustes de acentuação limitados ao texto da interface. | Matriz visual e testes de rótulos/formatadores. Códigos persistidos, nomes cadastrais e enums da API preservados. |
| UX09 — estados | Conciliação distingue seleção inicial, carregamento, erro e ausência de dados. Locais oferece erro e nova tentativa. | Carregamento, erro 503 simulado, recuperação real e busca vazia em duas dimensões/dois modos: 16 cenários. Mais oito verificações de paleta, totalizando **24**. |
| UX10 — documento | Resumo reconhece o snapshot aprovado e apresenta campos separados por favorecido de peças/serviços. Dados vêm do snapshot; cadastro incompleto é informado ao ADMIN. | Proposta nova **20028/00**, validade 18/11, peças R$ 400, serviços R$ 300, total R$ 700 e entrada R$ 210. Contas e CNPJs distintos conferidos no PDF e resumo; observação interna excluída. |
| UX11 — redação | Removidas instruções de implementação em mensagens operacionais; descrições voltadas à tarefa do usuário. | Revisão das telas alteradas, sem alteração em massa de descrições cadastrais. |
| S01–S05 — organização | Dados essenciais do contrato antecipados; orientação nos estados vazios; menos cartões redundantes no Studio/RH e ações de criação repetidas no cabeçalho; fonte e identidade existentes mantidas. | Galeria de contratos, Studio, colaboradores e navegação; nenhuma rolagem horizontal do documento nas 488 combinações. Tabelas largas mantêm rolagem local. |

## PDF: defeito adicional encontrado e corrigido

A consulta do PDF convertido a partir do Word repetia a conversão em cada abertura. Uma conversão excedeu o limite anterior de 60 segundos e a mensagem expôs detalhes técnicos do comando. A API agora:

- Reaproveita somente conversões válidas, identificadas pelo SHA-256 dos bytes do DOCX. Documentos diferentes não compartilham resultados.
- Compartilha a conversão em andamento do mesmo conteúdo e limita o cache a oito PDFs de até 2 MiB cada, no máximo 16 MiB.
- Devolve cópias dos buffers; falhas e arquivos sem assinatura PDF não entram no cache.
- Mantém a conversão real pelo LibreOffice, com limite padrão de 75 segundos, respeitando configuração explícita. Uma falha recebe mensagem recuperável; detalhes ficam no log do servidor.
- Não altera nem substitui snapshots e arquivos aprovados anteriormente.

Na API isolada, o mesmo DOCX retornou PDF válido em **37.180 ms** na primeira chamada e **720 ms** na segunda. Os bytes dos dois PDFs foram idênticos, e o hash do snapshot permaneceu igual. Esse resultado mede este ambiente e este documento; não é garantia de tempo para todas as propostas. O cache é de memória e esvazia ao reiniciar a API.

As quatro páginas foram renderizadas com Poppler e inspecionadas: capa Manitec, cabeçalho, rodapé, tabelas, recebimento e assinatura. Imagens em `evidencias/ux-correcoes-20261105/documento/`. A contratada do registro fictício ainda mostra os campos fiscais não preenchidos: a interface avisa essa pendência e não inventa dados de outra empresa.

## Regressão e experiência comercial

| Verificação | Resultado |
|---|---|
| Build final Next.js e checagem TypeScript do frontend | Aprovados; build separado `.next-ux-review`, sem substituir `.next` principal. |
| Regressão frontend — oito arquivos de testes | **46 testes aprovados**, incluindo calendário, CSV, conjuntos, duplicidades, recuperação/conflitos de rascunho, conferência e classificação técnica. Os testes reais do formulário rodaram em desktop/celular. |
| Backend — documentos, propostas, CRM e regras de acesso | **213 testes aprovados em 26 suítes**, incluindo quatro testes novos para cache, concorrência, conteúdo diferente e falha de conversão. Fixtures antigas foram completadas para as validações atuais; regras de aprovação, desconto e autorização não foram flexibilizadas. |
| Typecheck backend | **Aprovado**, usando o cliente Prisma correspondente à base isolada; não foi regenerado o cliente usado pelo principal. Dois métodos de RH receberam somente a anotação opcional do usuário autenticado no tipo da requisição, sem mudança de execução. |
| ESLint frontend | **0 erros, 7 avisos** preexistentes: uso de imagem, redirecionamentos de sessão e duas variáveis/funções sem uso. Não foram alteradas as rotinas de sessão para eliminar avisos. |
| Navegação visual | **488/488 cenários acessados**, nenhum estouro horizontal da página e nenhum campo visível sem nome acessível na coleta final. |
| Verificações dirigidas | **18 registros** de geometria, busca, conciliação, Studio e PDF; **24** de estados/paletas; nenhuma exceção JavaScript nessas rodadas. |
| Quatro etapas comerciais com API/base reais de teste | **10 verificações e 23 capturas**: TOF/TM/TB selecionáveis e desmarcáveis nos dois modos, inserção, cancelamento de duplicidade, remoção, salvamento e recuperação. Rascunho novo recuperado na revisão 3, com uma peça; rascunho anterior preservado. |
| Proposta formal nova | Conferência, escopo, envio à aprovação, aprovação e geração DOCX/PDF: **20028/00**, status `CLIENT_REVIEW`. Sem aceite do cliente, criação de recebimento real ou envio externo. |
| GETs que falharam na auditoria | `/contracts`, `/team/channels` e `/proposals`: **18/18 respostas 200** nas consultas diretas e pelo proxy, máximo observado de 1.531 ms. As telas dependentes foram novamente capturadas sem 500. A causa dos registros anteriores de `ECONNRESET` permanece sem comprovação. |

Os avisos de `localStorage`/`serviceWorker` do iframe do editor foram reproduzidos pelo contexto do coletor. O reteste manteve o atributo `sandbox` do produto, limitou a injeção de autenticação do teste à janela principal e evitou a injeção de bloqueio de service workers nesse contexto específico. As quatro capturas finais do editor não registraram exceções. Nenhuma proteção do iframe foi retirada do sistema.

Uma execução inicial de testes do formulário usou a URL padrão do runner, porta 3001. Os endpoints estavam interceptados por fixtures do navegador; não houve gravação na API principal. Essa execução foi descartada. As rodadas finais fixaram explicitamente interface 3004 e API 3006, com inicialização automática de servidores desativada.

## Integridade e alterações preservadas

As 160 tabelas da base isolada foram comparadas por contagem e hash de linha. **151 tabelas permaneceram inteiramente iguais**. Nas nove tabelas com inclusões da simulação, **todos os registros anteriores continuaram idênticos**. Isso inclui usuários/permissões, configurações, documentos aprovados antigos e rascunho anterior. As inclusões são a proposta fictícia, seus itens/movimentos/escopo/snapshot, novo rascunho e logs locais de acesso/geração.

A comparação usa o corte de 04/11/2026 20:01:30 UTC, após a coleta inicial e antes das novas simulações. Os hashes são da cópia isolada; não se alega coleta de hashes do banco principal. O registro `DELIVERED` com provider institucional identifica a geração/armazenamento local nesta implementação, sem significar envio externo. Nenhum comando de envio a terceiros foi acionado.

O inventário inicial de 766 arquivos e as cópias anteriores ficam em `runtime-logs/ux-correcoes-20261104`. A relação das alterações desta tarefa está nas evidências. Os arquivos novos incluem o diálogo compartilhado e os testes específicos de calendário/CSV e conversão. Alterações preexistentes do workspace foram preservadas. O HEAD continua `268398d3fc0e161b5e204c6a00eba68f6d8b8228`.

Somente servidores próprios de validação foram reiniciados: interface 3004 e API 3006. Interface 3001, API principal e banco principal não receberam reinício ou migração. As sessões de teste foram restauradas para claro/Neblina. Não houve controle da sessão de navegador aberta pelo usuário.

## Ressalvas e encaminhamento

| Criticidade | Pendência/limite | Encaminhamento |
|---|---|---|
| Alta — dados antes de envio comercial | Cadastro geral da contratada sem CNPJ/endereço completos na cópia isolada, embora perfis de pagamento tenham favorecidos próprios. | Responsável deve confirmar os dados institucionais e o emitente correto. Não copiar CNPJ de um favorecido por inferência, nem alterar documentos históricos. Bloqueia tratar a simulação como proposta pronta para um cliente real. |
| Média — desempenho | Primeira conversão Word/PDF ainda pode levar dezenas de segundos; cache é limitado e não persiste entre reinícios. | Manter DOCX disponível, acompanhar conversões a frio e recursos do servidor. Não prometer abertura instantânea para documentos não convertidos. |
| Média — diagnóstico operacional | Houve 500/ECONNRESET transitórios no histórico de coleta; não se repetiram nas consultas controladas e retestes finais. | Monitorar e correlacionar logs caso reapareçam. Não declarar causa resolvida sem reprodução e diagnóstico. |
| Média — abrangência de homologação | Portais CLIENT/TECHNICIAN, integrações bancárias/fiscais reais, todos os departamentos/carteiras e todos os limites de desconto não foram integralmente exercitados nesta revisão ADMIN. | Testes próprios dos perfis antes de homologação integral do ERP; a matriz mantém essas rotas identificadas. As regras existentes permaneceram ativas. |
| Baixa — manutenção | Sete avisos de lint fora dos defeitos corrigidos. | Tratamento posterior conforme contexto; não impedem a compilação validada. |

**Liberado para validação do usuário no ambiente 3004.** Para implantar no principal, usar o build e o cliente Prisma compatíveis, preservar o banco e conferir a configuração institucional. Esta tarefa não executou essa ativação.

Logs locais finais: `build-keyboard-final.log`, `frontend-tests-acceptance.log`, `backend-tests-acceptance.log`, `backend-typecheck-isolated-final.log`, `lint-acceptance.log`, `focused-acceptance.log`, `states-final.log`, `journey.log`, `commercial-flow.log` e `integrity-final.json`, em `runtime-logs/ux-correcoes-20261104`.
