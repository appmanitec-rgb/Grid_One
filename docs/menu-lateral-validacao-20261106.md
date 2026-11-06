# Menu lateral — atualização e validação de 06/11/2026

Implementação concluída no ambiente de validação **http://127.0.0.1:3004/dashboard**. Sem commit, push, migração ou ativação no principal.

## Comportamento aplicado

- **Abertura explícita:** o botão “Menu” ou o clique no ícone de um departamento abre a navegação. Passar o mouse e receber foco não abrem automaticamente.
- **Espaço reservado:** a lateral ocupa 80 px recolhida e 296 px aberta. O conteúdo se ajusta ao lado; o menu não cobre os campos da página. A largura não é animada quadro a quadro.
- **Fixar:** o alfinete mantém a lateral aberta durante a navegação e após recarregar. A preferência usa a identificação do usuário e é salva neste navegador; não é sincronizada entre dispositivos.
- **Recolher:** a seta fecha a lateral e salva a preferência recolhida. Sem fixação, selecionar uma página também fecha o menu. Clicar ou digitar em um formulário mantém a navegação estável. Esc limpa a pesquisa; com a pesquisa vazia e foco no menu não fixado, recolhe e devolve o foco ao botão de abertura.
- **Marca:** logo oficial completo e maior no cabeçalho aberto, com a mesma altura da barra superior.
- **Organização:** retirados os subtítulos redundantes dos grupos com até seis rotinas, no desktop e no celular. Grupos maiores continuam com divisões. Nenhuma rota ou departamento foi removido ou transferido.
- **Indicadores:** retirados os números que representavam quantidade de telas. Permanecem contagens de aprovação, O.S. em aberto, contratos que exigem atenção e mensagens não lidas, com descrições. Contratos/Renovações não contam duas vezes o mesmo indicador.
- **Ícones:** Suprimentos usa carrinho; Almoxarifado permanece com depósito; Ativos usa equipamento; RH usa pessoas; Operação usa chave de manutenção. Busca e favoritos foram preservados.

## Validação

| Verificação | Resultado |
|---|---|
| Build Next.js e TypeScript | Aprovados em `.next-ux-review`, separado do build principal. |
| ESLint dos arquivos alterados | Aprovado, sem erros ou avisos. |
| Playwright — seis arquivos | **26 testes aprovados:** dez interações da lateral, seis de estrutura/rotas/permissões, oito de entradas/ativação/MFA e dois do formulário comercial. |
| Desktop | Abertura/recolhimento e ausência de sobreposição em 1366, 1024 e 768 px. Um departamento aberto por vez; alinhamento do cabeçalho preservado. |
| Preferências | Fixar sobrevive a navegação/reload; outro usuário do mesmo navegador não herda a preferência; recolher também persiste. |
| Teclado e toque | Abertura por Enter, pesquisa, Esc, retorno de foco, tablet sem mouse e navegação móvel aprovados. |
| Permissões | Perfil técnico continua sem Financeiro, RH, Administração, Studio ou Contratos; a busca também não apresenta essas áreas. São testes de apresentação com fixtures; não constituem homologação de todos os perfis ou da autorização da API. |
| Formulário em edição | Quatro ciclos de abrir/fechar preservam o mesmo campo no DOM, seu valor, foco e resumo financeiro. Clicar no campo com o menu aberto não desloca o formulário. |
| Busca e favoritos | Favoritos funcionam e a busca mantém até dez resultados por vez. |
| Visual com API isolada real | **Oito combinações:** 1366/1024/768 × claro/escuro e 390 × claro/escuro, DPR 1/zoom 100%. Estados recolhido/aberto, pesquisa, fixação e menu móvel capturados. Nenhuma exceção JavaScript. |

A comparação estrutural do TypeScript confirma que os filtros por acesso, filtros de favoritos, consulta dos contadores, cálculo de contagem por seção e `isItemAllowed` permanecem iguais aos anteriores. As mudanças afetam apresentação e preferência de abertura. Não foram alteradas regras, carteiras, limites, dados ou serviços de backend.

Durante a coleta com API real, ocorreram dois GETs 500 no proxy (`/maintenance-orders` e `/proposals`), acompanhados de `ECONNRESET`, comportamento intermitente já registrado na auditoria anterior. O reteste direto e pelo proxy retornou **12/12 respostas 200**. A causa não foi comprovada nem tratada como resolvida por esta alteração de menu; manter o acompanhamento operacional. As contagens continuam usando os serviços e filtros existentes.

As execuções preliminares foram ajustadas para respeitar a pasta de trabalho exigida pelo teste de rotas e os parâmetros de filtro na URL dos fornecedores. O indicador de desenvolvimento do Next interceptava o botão móvel; a rodada final foi executada no build de produção isolado, sem forçar cliques ou retirar proteções.

## Evidências e preservação

[Menu aberto — claro](evidencias/menu-lateral-20261106/claro-aberto.png) · [Menu aberto — escuro](evidencias/menu-lateral-20261106/escuro-aberto.png) · [Recolhido](evidencias/menu-lateral-20261106/recolhido.png) · [Celular](evidencias/menu-lateral-20261106/celular.png) · [Verificações visuais](evidencias/menu-lateral-20261106/visual.json) · [Comparação da lógica](evidencias/menu-lateral-20261106/logic-proof.json).

Logs, capturas adicionais e cópias anteriores: `runtime-logs/menu-ajustes-20261105/`, incluindo `build-final.log`, `tests-acceptance.log`, `lint-final.log`, `visual-acceptance.log` e `api-recheck.json`. A pasta conserva a data de início da implementação.

Os testes funcionais usam respostas simuladas e não criam usuários, propostas ou contas reais. As capturas com API real fazem consultas; gravações e origens externas são bloqueadas. Preferências e tema são de um contexto próprio de navegador, descartado ao encerrar. As alterações preexistentes do workspace foram mantidas. O ambiente principal não foi reiniciado; somente o frontend de validação 3004 recebeu esta compilação.
