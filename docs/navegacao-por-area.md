# Navegacao por area

O menu lateral, a navegacao do celular e a familia exibida na barra superior usam o mesmo catalogo em frontend/lib/dashboard-navigation.ts. Os destinos existentes e as permissoes foram preservados; os identificadores dos favoritos antigos continuam validos.

| Area | Rotinas |
| --- | --- |
| Meu espaco | Painel pessoal, mensagens, notificacoes, documentos, envios e relatorios. |
| Comercial | Oportunidades, vistorias, propostas, pedidos de venda e clientes. |
| Contratos | Carteira e renovacoes. |
| Planejamento | Agenda, equipe tecnica, monitoramento e frota. |
| Operacao | Atendimento, O.S., portal tecnico, laudos, maquinas paradas e garantias. |
| Ativos | Equipamentos, modelos e locais. |
| Suprimentos | Solicitacoes, cotacoes, aprovacoes, pedidos de compra, fornecedores e regras. |
| Almoxarifado | Recebimento e separacao, estoque/reposicao e cadastro de pecas/servicos. |
| Financeiro | Faturamento, contas, cobranca, notas, tesouraria e custos. |
| Recursos Humanos | Colaboradores, documentos/certificacoes, EPIs, jornada, comissoes e usuarios/permissoes. |
| Administracao | Empresa e automacoes. |
| Manitec Studio | Dados, editor, auditoria e utilizacao. |

## Comportamento

- As areas e a busca so exibem rotinas permitidas ao usuario.
- A busca ignora acentos e combina palavras da area, grupo e rotina; retorna no maximo dez resultados e informa quando refinar a pesquisa.
- Um unico bloco fica aberto por vez. No computador, a abertura por mouse preserva a animacao existente por transformacao/opacidade, sem redimensionar o conteudo principal. No celular, as areas tambem usam acordeao.
- A rota mais especifica determina a selecao: renovacoes, cotacoes e recebimento/separacao nao deixam o item pai ativo ao mesmo tempo.
- Favoritos existentes continuam apontando para suas rotinas apos a reorganizacao.
- Contadores consultam apenas modulos autorizados. Uma resposta vazia nao interrompe os demais indicadores; um mesmo contador nao e somado duas vezes no grupo de contratos.

## Central do almoxarifado

A rota /dashboard/inventory/operations reutiliza os indicadores e filas autorizados de /dashboard/overview. Recebimento, separacao, estoque, validades e EPIs aparecem conforme as permissoes e o contexto operacional existentes. A confirmacao da separacao e o acompanhamento de validade continuam protegidos pelas regras da API. A pagina nao cria permissao de acesso ao pedido de compra ou a dados pessoais do RH.

Nao foram adicionadas migracoes, tabelas ou alteracoes automaticas de usuarios/permissoes.

## Validacao

Seis verificacoes do catalogo cobrem destinos reais, chaves e rotas unicas, distribuicao das areas, selecao unica, busca limitada e ausencia de itens bloqueados. Tipos e lint dos componentes conferidos. Os testes de navegacao existentes foram atualizados para ler o novo catalogo e considerar o campo de busca no fluxo de teclado. O navegador integrado estava indisponivel; nao foi feita inspecao visual automatizada nesta sessao.

## Implantacao local

Ativo em 21/10/2026: 12 areas e 58 rotinas. Build de producao concluido com 95 paginas. Somente o processo da interface foi reiniciado; API, banco, usuarios e permissoes permaneceram em execucao sem alteracao. O build anterior da interface foi preservado para recuperacao.

Painel, central do almoxarifado, pedidos de compra e faturamento responderam HTTP 200. A conferencia autenticada de Administrador e Suprimentos confirmou o contexto existente da API e do proxy. Evidencias privadas em runtime-logs/menu-deployment-current.json. Atualize com Ctrl+F5 para carregar o novo menu.

## Refinamento visual do menu

Icones compartilhados e padronizados em NavigationIcon.tsx, areas inativas neutras, destaque contido da area/tela ativa, tipografia e contraste revistos, arvore de rotinas com menos contornos, favoritos discretos e rodape compacto. A busca, as doze areas, as 58 rotinas e os favoritos foram preservados. O menu movel usa a mesma linguagem visual e cores vinculadas diretamente ao tema ativo. Os subtitulos de grupo aparecem quando ajudam a distinguir mais de uma categoria. A expansao lateral mantem a largura fixa e a animacao anterior por transformacao/opacidade; movimento reduzido continua respeitado.

Tipos e lint conferidos; as seis verificacoes existentes do catalogo de navegacao passaram novamente. O contraste calculado dos textos principais usados no menu lateral ficou acima de 5:1 contra a extremidade mais clara do fundo. O navegador integrado estava indisponivel, portanto esta sessao nao incluiu inspecao visual automatizada.

Acabamento visual ativo localmente em 21/10/2026. Build das 95 paginas aprovado e interface reiniciada mantendo o processo da API. Painel, almoxarifado, propostas e perfil responderam HTTP 200; consultas autenticadas de Administrador e Suprimentos e o proxy permaneceram funcionais. Nenhuma migracao ou alteracao de dados/permissoes. Evidencias privadas em runtime-logs/menu-visual-deployment-current.json.
