# Revisão da interface para validação local

## O que mudou

- Fonte de interface mais discreta e hierarquia de títulos, descrições e valores.
- Botões, campos, cabeçalhos, tabelas, paginação e mensagens com estilos compartilhados.
- Expansão dos painéis com “Ver detalhes” / “Recolher” e ícones SVG.
- Ações com ícones de criar, abrir, voltar, baixar e ordenar.
- Textos mais diretos em Comercial, Operação, Financeiro, RH, Compras e central do cliente.
- Estados de carregamento, erro e lista vazia nos apontamentos de RH.
- Estilos compatíveis com as paletas existentes e os modos claro e escuro.

## Como validar

Acesse http://localhost:3001/dashboard com seu usuário habitual. Atualize a página para carregar os novos arquivos.

| Área | Conferir |
| --- | --- |
| Dashboard | Expandir e recolher painéis; conferir indicadores e atalhos |
| Comercial | Listas, propostas, formulários, clientes e contratos |
| Operação | Chamados, O.S., relatórios e agenda |
| Suprimentos e almoxarifado | Compras, estoque, botões de ajuste e reposição |
| Financeiro | Contas a pagar e receber, fluxo de caixa, conciliação |
| RH | Documentos, usuários e apontamentos por competência |
| Central do cliente | Navegação, chamados, propostas e formulários |
| Temas | Alternar claro/escuro e conferir campos, mensagens e tabelas |
| Celular | Conferir quebra de ações, rolagem das tabelas e navegação |

Os estilos são compartilhados entre as telas; não houve inspeção visual individual de cada página porque o navegador integrado não estava disponível nesta sessão.

## Escopo preservado

Sem migração, exclusão ou alteração de registros. A revisão não altera regras de acesso, limites comerciais ou contratos da API. Os modelos de impressão mantêm seus estilos.

A revisão automática bloqueou alterações diretas no painel do editor de documentos por possível impacto nos modelos. Essas alterações foram excluídas do lote; o editor não tem diff.

## Publicação

Alterações mantidas localmente para validação. Nenhum commit ou push.

## Verificações realizadas

- Build de produção e TypeScript concluídos.
- ESLint dos arquivos alterados: zero erros; três avisos preexistentes.
- Seis testes da estrutura de navegação aprovados.
- Doze rotas principais responderam HTTP 200.
- CSS novo confirmado na resposta do frontend; proxy da API respondeu HTTP 200.
- Conferência visual no navegador pendente de validação do usuário.
