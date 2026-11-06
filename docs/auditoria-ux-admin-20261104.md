# Auditoria UX/UI do Manitec GridOne — visão ADMIN

Data: 04/11/2026. Avaliação realizada em navegador Chromium com Playwright. Este relatório avalia a versão do ambiente isolado; não certifica a versão em uso na porta 3001.

## Parecer

O sistema tem identidade visual coerente, boa separação dos departamentos e componentes que já sustentam um ERP profissional. A paleta azul da Manitec funciona nos dois modos. O tema escuro manteve superfícies, campos, filtros e mensagens legíveis na maior parte das telas examinadas; os quadros claros em uma prévia de documento representam o papel do documento, e não um erro de inversão de tema.

O principal problema atual é a organização da informação: indicadores e cartões repetidos afastam o trabalho principal, sobretudo no celular. Há também defeitos concretos que exigem correção: datas de calendário deslocadas, um indicador espremido, linhas de tabela excessivamente altas, campos sem nome acessível e navegação de teclado inadequada na janela do PDF.

**Parecer de acabamento: aprovado como base visual para evolução; reprovado para considerar encerrada a padronização e a acessibilidade.** Não há evidência de bloqueio geral do ERP ou de perda de registros antigos nesta auditoria. Os itens P1 abaixo precisam ser corrigidos e novamente verificados antes de declarar a experiência pronta. Esta conclusão não representa uma homologação funcional de todos os departamentos.

| Critério | Nota / 10 | Justificativa |
|---|---:|---|
| Cores | 8,0 | Azul institucional, superfícies neutras e estados semânticos coerentes; alguns textos secundários ficam claros demais. |
| Tema claro | 7,5 | Boa leitura e hierarquia principal; contraste de legendas, excesso de bordas e densidade irregular precisam melhorar. |
| Tema escuro | 8,0 | Boa adaptação das superfícies operacionais e dos formulários examinados; conteúdo longo e rótulos deficientes continuam problemáticos. |
| Organização | 6,0 | Cartões redundantes, tabelas extensas e tarefa principal abaixo da primeira área visível. |
| Padronização | 6,5 | Base compartilhada consistente, com exceções no Studio, RH, nomenclatura e paginação. |
| Textos | 6,0 | Instruções geralmente úteis; faltam acentos e formatos brasileiros, e há linguagem de implementação exposta ao usuário. |
| Navegação | 7,0 | Agrupamento por departamentos e pesquisa do menu ajudam; títulos superiores divergentes e repetição da navegação dificultam orientação. |

As notas são julgamento profissional fundamentado nas evidências, não resultado de pesquisa com colaboradores nem certificação WCAG.

## Ambiente, método e cobertura real

- Frontend: `http://127.0.0.1:3003`; API: `http://127.0.0.1:3006`; banco: `gridone_proposals_f1_20261023`. Uso exclusivo deste ambiente nos testes.
- Sessão do ADMIN existente, MARCOS, sem alterar contas ou permissões. A autorização posterior do usuário permitiu simulações fictícias de negócio nesta cópia isolada.
- Desktop **1366 × 900** e janela móvel **390 × 844**, zoom **100%**, DPR **1**. A janela estreita foi testada no Chromium desktop; não houve certificação em aparelho físico, Safari ou leitor de tela real.
- Inventário prévio: **12 áreas de menu, 60 entradas, 117 rotas-fonte e 28 tabelas Studio**, expandidas em **145 casos de rota**.
- **122 casos tiveram a tela efetiva capturada em quatro combinações: claro/escuro × desktop/móvel**. Outros 3 são aliases, 2 pertencem ao técnico, 16 ao portal de cliente e 2 ao acesso/ativação do cliente. Estes últimos constam como limitados, sem aprovação do conteúdo protegido. A ficha de oportunidade foi examinada com novo registro atribuído ao ADMIN, depois de o acesso ao registro anterior ter sido corretamente negado.
- **538 registros brutos de coleta**, incluindo os redirecionamentos e as tentativas limitadas. Essa quantidade não corresponde a 538 telas nem substitui a matriz de cobertura.
- Além das rotas: **19 estados de abas, filtros, formulários e janelas**, cada um nos quatro cenários, totalizando **76 capturas adicionais**. Incluem filtros de cliente/catálogo, novo chamado/O.S./oportunidade, Kanban, abas de equipamento, preços/rastreabilidade, edição de laudo, editor/biblioteca e opções do Studio.
- Nas páginas com conteúdo maior, o coletor percorreu os contêineres de rolagem e registrou a região final. A revisão visual comparou painéis das quatro versões e abriu evidências específicas em tamanho maior. Isso não equivale a revisar cada pixel ou exercitar toda combinação de campos em cada formulário.
- A paleta **Neblina** foi a base da cobertura completa. Marfim, Mineral e Grafite foram verificadas no painel em claro e escuro; a cobertura integral das outras paletas permanece pendente.

Consulte a [matriz legível](auditoria-ux-admin-20261104-matriz.md), o [CSV com as 145 linhas](auditoria-ux-admin-20261104-matriz.csv) e a [galeria de evidências](evidencias/auditoria-ux-20261104/index.html).

## Simulações e estados exercitados

Após a ampliação expressa da autorização, foram criados registros com prefixo **QA-UX-20261104**: um cliente, dois equipamentos, seis peças de manutenção, um fornecedor, uma oportunidade, uma O.S., um chamado, um laudo em rascunho, um contrato suspenso, um pedido em rascunho, uma solicitação e uma cotação em preparação. Eles permanecem apenas na base isolada para reprodução. Não representam trabalho real ou ativação de contratos.

| Exercício | Resultado observado | Limite |
|---|---|---|
| Proposta fictícia **20027/00** | Fluxo real da API: preenchimento, conferência, envio à diretoria, aprovação ADMIN e geração DOCX/PDF. Total **R$ 700,00**, entrada **R$ 210,00**, saldo **R$ 490,00**. | Não houve aceite do cliente, ganho, baixa de entrada, faturamento ou conversão em O.S. desta proposta. |
| Contas de peças e serviços | Conferência retornou aviso de emitentes diferentes; os dados foram mantidos separados no teste. | Não comprova conciliação/recebível real; não foi autorizada atribuição de um recebimento a dois CNPJs. |
| Documento do cliente | Capa e cabeçalho Manitec presentes; as quatro páginas foram renderizadas no navegador. Texto interno de controle ausente do conteúdo público verificado. | Não foi feita revisão jurídica nem homologação de impressão física. Dados gerais da contratada estão incompletos na configuração isolada. |
| Quatro etapas do vendedor | Dados comerciais, peças, serviços e revisão abertos nos dois temas e dimensões. | Não cobre todas as combinações de desconto, despesas e conflitos concorrentes de sessão. |
| TOF / TM / TB | Seleção e desmarcação de cada conjunto nos dois temas; inclusão de TOF; conferência de duplicidades cancelada sem duplicar. | Itens de teste tinham preço cadastrado zero; o bloqueio de edição manual de preço foi respeitado. |
| Rascunho | Remoção de peça, salvamento explícito e recuperação após recarregar confirmados. Ao final havia uma peça com quantidade preservada. | O rascunho do editor é distinto da proposta formal 20027/00. Não confundir salvar rascunho com emitir proposta. |
| Fornecedores | Estado de consulta pendente retido no navegador, 503 simulado, mensagem de erro, recuperação com GET real e busca sem resultado. | Não é medição de desempenho de produção; servidor e banco não foram retardados nem derrubados. |
| Menu móvel | Pesquisa e oito tabulações com foco contido verificadas nos dois temas; fechar com teclado confirmado. | Na pesquisa, o primeiro Esc limpa a busca e o segundo fecha, comportamento previsto no componente. |
| PDF / teclado | Renderização e navegação de quatro páginas funcionaram. | Tab saiu do diálogo e Esc manteve a janela aberta: UX04B abaixo. |

Dez verificações dirigidas da jornada de conjuntos/rascunho passaram. Falhas iniciais de automação foram corrigidas no coletor: nome de botão/link, acentos ausentes na interface, espera por recuperação assíncrona e salvamento que mantém o usuário na mesma tela. Não foram classificadas como defeitos do ERP.

## Achados prioritários — defeitos observados

P1: alto impacto ou barreira de acesso; P2: atrito recorrente; P3: acabamento. Não foi confirmado P0 nesta avaliação.

### UX01 · P1 · Datas de calendário aparecem um dia antes

**Onde:** ficha de contrato, relação do cliente, detalhe da proposta e resumo documental. Ambos os temas, desktop e móvel.

**Reprodução:** contrato fictício CTR-00001 com início persistido `2026-11-04T00:00:00Z` e fim `2027-11-04T00:00:00Z`; ficha mostra **03/11/2026 até 03/11/2027**. Proposta 20027/00 tem validade **18/11/2026**, mas o resumo mostra **17/11/2026**; o PDF mostra **18/11/2026**.

**Impacto:** o colaborador recebe informação divergente para vigência, vencimento e comunicação comercial. A hipótese técnica é conversão de data sem horário como instante no fuso local; a divergência foi observada, a causa precisa ser confirmada na implementação.

**Recomendação:** tratamento compartilhado de data de calendário preservando o dia ISO; manter datas/horários de eventos no fuso apropriado. Não corrigir valores armazenados para compensar o erro visual. Aceite: tela e documento exibem o mesmo dia salvo em São Paulo e UTC.

Evidências: [contrato](evidencias/auditoria-ux-20261104/UX01-contrato-vigencia.png), [resumo da proposta](evidencias/auditoria-ux-20261104/UX01-proposta-validade.png), [PDF com a data correta](evidencias/auditoria-ux-20261104/PDF02-valor-validade.png).

### UX02 · P1 · Indicador de validade comprimido no almoxarifado

**Onde:** `/dashboard/inventory/operations`, 1366 px, claro e escuro.

**Observado:** o cartão Produtos vencidos / a vencer tem **69,1 px de largura**, dentro de uma grade de quatro colunas aninhada em uma coluna de aproximadamente 300,5 px. Os demais cartões usam a largura normal. Texto quebra quase palavra por linha e sobra área vazia no bloco.

**Recomendação:** ajustar a estrutura da grade deste bloco, retirar a divisão herdada do invólucro e dar a todos os indicadores o mesmo comportamento responsivo. Evitar uma regra CSS global que afete outras grades. Aceite: nenhum indicador comprimido e nenhuma quebra artificial a 1366 px; a 390 px, resumo compacto sem encobrir a fila.

Evidências: [claro](evidencias/auditoria-ux-20261104/UX02-almoxarifado-claro.png), [escuro](evidencias/auditoria-ux-20261104/UX02-almoxarifado-escuro.png).

### UX03 · P1 · Lista de locais despeja centenas de nomes em uma célula

**Onde:** `/dashboard/sites`, ambos os temas e dimensões. Primeira linha: Sem local definido.

**Observado:** a célula de clientes contém **4.543 caracteres** e a linha tem **740,9 px de altura no desktop**. No celular a mesma lista comprime as colunas e exige longa rolagem antes de localizar outro registro.

**Recomendação:** exibir quantidade e no máximo dois nomes/duas linhas na linha principal; permitir consulta pesquisável dos vínculos em contexto, limitada a dez resultados por vez. Tratar Sem local definido como agrupamento de pendências de vínculo, sem sugerir que todos os clientes ocupam uma instalação física. Preservar relacionamentos e contagens.

Evidências: [desktop](evidencias/auditoria-ux-20261104/UX03-locais-desktop.png), [móvel](evidencias/auditoria-ux-20261104/UX03-locais-mobile.png).

### UX04 · P1 · Campos sem identificação programática suficiente

**Onde:** filtros de `/dashboard/billing`, formulário de saída em `/dashboard/hr/epis-tools` e campos do cadastro de catálogo. Há candidatos adicionais na coleta; exigem confirmação caso a caso.

**Confirmado no DOM/árvore de acessibilidade:** faturamento contém busca e seletor sem associação explícita de label; em EPIs, o seletor EPI/Ferramenta aparece apenas como combobox sem nome e a data de entrega aparece como textbox sem nome. Placeholders como Descricao do item fornecem uma identificação circunstancial, mas não substituem rótulo persistente e associação correta.

**Recomendação:** `label`/`htmlFor` e `id` únicos, ou `aria-labelledby` em controles compostos; transmitir o nome ao input realmente focável do componente pesquisável. Nomear seletores de tipo/data e distinguir origem/destino. Aceite: todos os controles acionáveis obtidos por `getByLabel` ou role com nome; nenhuma duplicação de id; navegação por teclado preservada. Não contar selects nativos ocultos como falhas isoladas.

Evidências: [faturamento](evidencias/auditoria-ux-20261104/UX04-campos-faturamento.png), [formulário EPI](evidencias/auditoria-ux-20261104/UX04-campos-epi.png); árvore acessível em `runtime-logs/auditoria-ux-20261104/final-proof.json`.

### UX04B · P1 · Janela do PDF não mantém o foco nem responde a Esc

**Onde:** `/dashboard/documents/proposals/[id]` → Visualizar PDF do Word.

**Reprodução:** abrir o PDF, percorrer com Tab e pressionar Esc. Das doze tabulações registradas, o foco saiu do elemento com `role=dialog`; Esc não o fechou. A presença de `aria-modal=true` sozinha não contém o teclado.

**Recomendação:** diálogo acessível com foco inicial previsível, contenção de Tab/Shift+Tab, Esc para fechar, fundo inerte e retorno do foco ao botão de origem. Reutilizar infraestrutura existente quando adequada. Preservar visualização, download, texto acessível e documento histórico.

Evidência funcional: `runtime-logs/auditoria-ux-20261104/pdf-review.json`. [Janela real](evidencias/auditoria-ux-20261104/PDF01-capa-claro.png).

### UX05 · P2 · Texto secundário de atendimento abaixo do contraste esperado

**Onde:** `/dashboard/atendimento`, tema claro, texto de canal/cliente/equipamento com 12 px.

**Medição:** `rgb(113,130,154)` sobre branco resulta em **3,92:1**. Cabeçalhos menores de tabela também apresentaram aproximadamente **4,07:1**. A referência para texto normal é **4,5:1**.

**Recomendação:** escurecer o token de texto secundário desta superfície e validar as combinações nos dois modos; não aumentar somente o peso nem trocar todo texto por azul de link. Preservar diferenciação entre conteúdo principal e apoio. Evitar fontes menores para fazer o conteúdo caber.

Evidência: [atendimento](evidencias/auditoria-ux-20261104/UX05-contraste-atendimento.png). A medição automática considerou cores sólidas e composição alfa; gradientes, imagens, transparências complexas e controles desabilitados exigem revisão manual. Candidatos automáticos do resumo documental com razão 1:1 foram descartados como falsos positivos: o fundo escuro aparece em gradiente na imagem real. Não se afirma conformidade WCAG integral.

### UX06 · P2 · Studio repete paginação e ocupa o celular com indicadores redundantes

**Onde:** 28 tabelas do Studio; exemplos Tarifas Operacionais e Tarifas de Hora.

**Observado:** Registros e Resultado atual repetem o mesmo número, seguidos de Campos visíveis. Em 390 px os três cartões e filtros afastam a tabela da primeira área visível. No desktop há duas paginações: Exibindo / Itens por página / 1 de 1 e, em seguida, Anterior / 1 / 1 / Próxima.

**Recomendação:** faixa compacta com total e quantidade filtrada; campos visíveis junto ao controle Colunas; uma paginação com um seletor de tamanho. Aceite: sem controle duplicado e primeira linha acessível sem atravessar três grandes indicadores. Preservar filtros, seleção de colunas, ordenação e exportação.

Evidências: [desktop](evidencias/auditoria-ux-20261104/UX06-studio-desktop.png), [móvel](evidencias/auditoria-ux-20261104/UX06-studio-mobile.png).

### UX07 · P2 · Páginas de colaboradores repetem o portal da área antes da tarefa

**Onde:** `/dashboard/management/users` e páginas filhas de documentos, finanças, O.S. e peças. Problema mais evidente em 390 px.

**Observado:** cabeçalho, indicadores e cartões de Divisões da área são repetidos antes do conteúdo específico, alongando a navegação.

**Recomendação:** nas páginas filhas, navegação compacta com área atual identificada; manter o painel completo apenas na entrada da área. Colocar busca/lista/formulário principal antes de explicações secundárias. Preservar integralmente visibilidade e ações por permissão.

Evidência: [RH móvel](evidencias/auditoria-ux-20261104/UX07-rh-mobile.png).

### UX08 · P2 · Título superior não identifica a página e faltam formatos em português

**Onde:** Documentação do RH, Conciliação, extrato e Equipe mostram Meu painel no cabeçalho superior; o conteúdo tem outro título. Tabelas Studio exibem `DISPLACEMENT`, `CONTRACT`, `JUNIOR_TECHNICIAN`, `2.5` e `120` como valores de negócio sem tradução/formato.

**Recomendação:** derivar título e caminho de uma fonte de navegação consistente, com identificação correta das rotas filhas; mostrar Deslocamento / Contrato / Técnico júnior e R$ 2,50 / R$ 120,00 onde o campo é monetário. Manter códigos técnicos disponíveis quando necessários, sem alterar enum no banco. Corrigir acentos de rótulos da interface: Código, Histórico, Preços, Observações, Técnico, Até. Não editar em lote nomes de clientes/produtos importados.

Evidências: [título RH](evidencias/auditoria-ux-20261104/UX08-titulo-rh.png), [Studio](evidencias/auditoria-ux-20261104/UX06-studio-desktop.png).

### UX09 · P2 · Conciliação mostra carregamento sem seleção necessária

**Onde:** `/dashboard/finance/reconciliation`, antes de selecionar conta, claro e escuro.

**Observado:** Carregando extratos / Buscando importações bancárias persiste após espera adicional de 5,2 s, enquanto o relatório informa corretamente Selecione uma conta.

**Recomendação:** distinguir aguardando seleção, carregando, vazio e erro. Sem conta, apresentar Selecione uma conta para consultar os extratos e desabilitar apenas ações dependentes. Loading deve corresponder a requisição pendente real. Não simular integração bancária disponível.

Evidência: [conciliação](evidencias/auditoria-ux-20261104/UX09-conciliacao.png).

### UX10 · P2 · Resumo documental tem mensagem incompatível com a geração existente

**Onde:** resumo da proposta 20027/00, bloco Documento institucional.

**Observado:** aparece Nenhum documento institucional gerado, embora os botões retornem DOCX/PDF e o documento renderize. O resumo também lista os dados bancários como um texto longo de observações, tornando peças e serviços difíceis de comparar. Cabeçalho repete instruções e deixa grande espaço ao lado dos dados incompletos da empresa.

**Recomendação:** derivar a informação da versão/documento efetivamente disponível; mostrar status e data da versão correta. Reutilizar apresentação estruturada de peças/serviços para dados de recebimento, preservando os valores e emitentes de cada um. Não regenerar snapshots antigos para ajustar a tela.

Evidências: [região final](evidencias/auditoria-ux-20261104/UX10-resumo-documento.png), [PDF disponível](evidencias/auditoria-ux-20261104/PDF02-valor-validade.png).

### UX11 · P2 · Linguagem de implementação aparece em conteúdo operacional

**Onde:** ficha do contrato e textos do Financeiro. Exemplos: Referência financeira do contrato, sem refatorar o módulo financeiro; referência a backend em instrução de recebíveis. No Studio há termos técnicos pertinentes à administração; o problema é expô-los como orientação de trabalho comum.

**Recomendação:** substituir por resultado ou instrução concreta: Faturas e recebimentos vinculados a este contrato; Consulte os títulos e confira o pagamento antes de encerrar. Explicar restrições reais sem descrever como o código foi organizado. Corrigir junto de UX08, com revisão humana de português.

Evidência original: captura `019-light-1366.png` e `067-dark-390-bottom.png` na pasta local da auditoria; a matriz contém os caminhos.

## Recomendações de organização e acabamento — preferência de projeto

Estas sugestões não foram tratadas como falhas de negócio nem justificam redesenhar todos os módulos.

| ID | Prioridade | Ajuste específico | Verificação |
|---|---|---|---|
| S01 | P2 | Colocar cliente, vigência, situação e recorrência no início do contrato; agrupar relações e histórico abaixo. | O usuário identifica o contrato antes de percorrer cartões financeiros vazios. |
| S02 | P2 | Em estados vazios de vistorias e rotinas de RH, dizer o que está faltando e como a lista é alimentada; oferecer apenas ações já existentes e permitidas. | Vazio distinto de erro/carregamento; nenhuma promessa de integração não implementada. |
| S03 | P3 | Reduzir bordas internas e cartões encaixados, mantendo uma superfície por bloco de tarefa; usar espaçamento de 8/12/16/24 px conforme contexto. | Mesma hierarquia em lista/formulário; números e ações não ficam dispersos. |
| S04 | P3 | Rever repetição de Novo fornecedor e ações equivalentes no topo global e no cabeçalho da página. | Uma ação primária claramente identificável; nenhum comando essencial removido no celular. |
| S05 | P3 | Manter tipografia do sistema, títulos curtos e verbos concretos; evitar descrições promocionais em cada cartão. | O colaborador encontra a ação e o dado sem ler parágrafos repetidos. |

## Componentes compartilhados e correções específicas

**Compartilhados:** formatação de datas de calendário, títulos/caminhos, rótulos e inputs pesquisáveis, diálogo acessível, token de texto secundário, paginação do explorador, formatos de moeda/enum e estados de carregamento/vazio/erro. Corrigir aqui permite melhorar várias telas sem substituir componentes consolidados.

**Específicos:** grade do almoxarifado, resumo dos vínculos em Locais, composição das páginas filhas de colaboradores, estado inicial da Conciliação, conteúdo do resumo documental e hierarquia do contrato. Uma alteração visual global não resolve adequadamente essas estruturas.

## Integridade e limites da conclusão

- Não houve edição de código do produto, commit, push, migração, reinício ou ativação no ambiente principal. Foram criados apenas scripts locais de auditoria, este relatório e suas evidências.
- A impressão digital SHA-256 de `backend/src`, `backend/prisma`, `frontend/app` e `frontend/lib` permaneceu igual ao início: `0746f9250e8c31ca3f4da56c9acb5f590c41209f4a7d41e211ee305f4b9aefb1`.
- As 160 tabelas da cópia isolada tiveram contagens e hashes antes/depois. As diferenças correspondem às inclusões autorizadas e aos registros internos de acesso/geração. Os usuários/permissões e os snapshots anteriores permaneceram iguais; as linhas antigas das tabelas com inclusões foram comparadas separadamente. Detalhes: `runtime-logs/auditoria-ux-20261104/integrity.json` e `integrity-children.json`.
- A geração/consulta de arquivos cria registros internos em `document_deliveries` com provider `manitec-institutional-docx` / `manitec-institutional-docx-pdf`, canal WEBHOOK e status DELIVERED. No código atual isso também registra armazenamento local, não significa disparo externo. Nenhum comando de envio por e-mail/WhatsApp/webhook externo foi acionado; a sessão de navegador bloqueou origens externas.
- Tema e paleta das sessões de teste foram restaurados para claro/Neblina. A sessão aberta do usuário na porta 3001 não foi controlada.
- Durante a coleta, GETs auxiliares para `/team/channels`, `/contracts` e `/proposals` tiveram respostas 500. A repetição direta posterior com o mesmo ADMIN retornou 200 nos três endpoints. Há evidência de falha intermitente, sem causa demonstrada; correlacionar logs antes de atribuí-la a layout ou declarar estabilidade. As restrições 403 de portais/perfil são esperadas; o 403 do heartbeat foi produzido pela proteção do coletor e não é defeito do ERP.
- O iframe isolado de prévia do editor gerou avisos de acesso a localStorage/serviceWorker sem allow-same-origin. Não houve comprovação de perda de edição ou falha do ERP decorrente desses avisos; não remover o isolamento para silenciá-los.
- A configuração geral da contratada na base isolada está incompleta: documento mostra MANITEC com CNPJ/endereço ausentes, apesar de os perfis de pagamento terem seus favorecidos. Isso é pendência de dados/configuração a esclarecer, não prova de que o template inventa ou perde dados. Não enviar essa proposta fictícia a um cliente nem copiar dados de uma empresa para outra automaticamente.
- Não foram exercitados envio externo, certificado/emissão fiscal, integração bancária real, aceite do cliente, todos os fluxos TECHNICIAN/CLIENT, perfil de cada departamento, concorrência de duas abas, todos os limites de desconto ou todas as combinações de despesas. A matriz explicita a limitação de cada rota. Sem alegação de homologação integral.
- Não foi executada nova suíte de regressão do produto porque o código não foi alterado. Os testes desta rodada são os testes reais de navegador e simulações indicados, com resultados próprios. Correções futuras exigem regressão direcionada e nova comparação visual.

## Plano de evolução

1. **Correção e acesso:** UX01 a UX04B. Datas, grade espremida, Locais e teclado/rótulos. Encerrar com testes reproduzíveis em claro/escuro e 1366/390.
2. **Leitura e orientação:** UX05, UX08, UX09 e UX10. Contraste, nomes/caminhos, formatos, estados e coerência do resumo documental. Investigar respostas 500 com logs, sem mascarar erro com lista vazia.
3. **Eficiência diária:** UX06, UX07, UX11 e S01/S02. Compactar Studio/RH, eliminar paginação repetida e orientar vazios sem mudar regras de negócio.
4. **Acabamento:** S03 a S05. Bordas, espaçamentos, repetição e redação. Preservar cores, marca e componentes que já funcionam.
5. **Nova validação:** repetir esta matriz nas telas afetadas e dependentes; concluir acessos hoje limitados com sessões de teste próprias dos perfis, sem ampliar privilégios de usuários existentes. Comparar as três paletas restantes nos componentes alterados.

O [prompt de implementação](auditoria-ux-admin-20261104-implementacao.md) transforma estes achados em tarefas e critérios de aceite. Ele foi preparado como entrega da avaliação; nenhuma dessas correções foi aplicada nesta rodada.

Continuação autorizada: as correções e os retestes de 05/11/2026 estão no [relatório de implementação e validação](ux-correcoes-validacao-20261105.md), com galeria comparativa e ressalvas. Os resultados acima permanecem como registro da auditoria original.
