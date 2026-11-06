# Prompt de implementação — correções da auditoria UX ADMIN

Este documento é uma entrega da auditoria, não execução de alterações. Use-o em uma tarefa posterior autorizada.

Atue como responsável por UX/UI e engenharia frontend do Manitec GridOne. Leia `docs/auditoria-ux-admin-20261104.md`, a matriz CSV/Markdown e `docs/evidencias/auditoria-ux-20261104/README.md`. Consulte as instruções AGENTS.md e a documentação local exigida antes de editar o frontend.

Objetivo: corrigir os achados comprovados e melhorar eficiência das telas existentes, preservando a identidade Manitec, os dados e todas as permissões. Não redesenhar o ERP nem incluir módulos novos.

## Condições de trabalho

- Trabalhar exclusivamente em banco/servidores isolados. A porta 3001 e o banco principal podem estar em uso; não reiniciar, migrar nem ativar nada neles.
- Inspecionar o estado do Git e preservar alterações preexistentes. Não fazer commit, push ou publicação sem autorização específica da nova tarefa.
- Não alterar carteiras, perfis, limite de desconto, aprovação, segregação de emitentes, plantões, autorização da API ou regras financeiras para facilitar a interface.
- Usar os componentes existentes. Evitar novos overrides globais de CSS; não aplicar regras por nomes genéricos que atinjam grades internas de outras telas.
- Não mudar valores históricos, bancos/PIX ou datas persistidas para compensar defeitos de apresentação. Não regenerar documentos aprovados existentes. Usar novos registros fictícios nas verificações.
- Nunca inserir CPF/CNPJ ou endereço de uma empresa em outra por inferência. Configuração incompleta deve ser identificada e encaminhada, sem fabricação de dados.

## Bloco 1 — alta prioridade

1. **UX01 — calendário.** Localizar os formatadores que transformam datas ISO sem horário em data local do dia anterior. Implementar tratamento reutilizável de calendário, distinto de timestamp. Aplicar às fichas/relacionamentos de contratos, propostas e resumo documental. Validar contratos de 04/11/2026 a 04/11/2027 e validade 18/11/2026 em São Paulo e UTC. A tela deve mostrar os mesmos dias da API e do documento. Não alterar banco.
2. **UX02 — almoxarifado.** Corrigir o invólucro de Produtos vencidos / a vencer: a evidência mede apenas 69,1 px no desktop. Todos os cartões devem ter dimensões coerentes, sem grade de quatro colunas dentro da coluna do indicador. Não permitir quebra quase vertical. Verificar 1366 e 390 px nos dois modos.
3. **UX03 — Locais.** Resumir os vínculos por contagem e até dois nomes/duas linhas. Disponibilizar a consulta contextual pesquisável dos demais, usando padrão existente e até dez resultados por vez. O agrupamento Sem local definido deve deixar clara a ausência de vínculo. Manter contagens, edição e navegação. Nenhuma lista de centenas de nomes dentro da célula principal.
4. **UX04 — rótulos.** Corrigir associação de label nos filtros de faturamento, tipo/data da saída de EPI e inputs focáveis pesquisáveis do catálogo. Verificar candidatos nas demais telas da matriz sem contar controles ocultos como defeitos. Nomes acessíveis únicos e persistentes; `getByLabel`/role com nome deve encontrar cada controle. Não usar somente placeholder.
5. **UX04B — diálogo PDF.** Conter Tab/Shift+Tab, colocar foco inicial, permitir Esc, tornar fundo inerte e devolver foco ao disparador. Preservar páginas, download, texto acessível e dados do snapshot. Testar com PDF de quatro páginas e em 390 px.

## Bloco 2 — legibilidade e orientação

6. **UX05 — contraste.** Corrigir texto secundário normal de atendimento de 3,92:1 e cabeçalhos de aproximadamente 4,07:1 para pelo menos 4,5:1. Medir o token por tema e superfície. Desconsiderar falsos positivos de gradientes/controles desabilitados; validar a captura real. Sem inversão de cores no papel do PDF nem alteração da marca.
7. **UX08 — títulos/formatação.** Consertar cabeçalhos que usam Meu painel em Documentação, Conciliação, extrato e Equipe. Rotas filhas devem indicar sua página; usar a fonte compartilhada de navegação. Corrigir acentos dos rótulos e apresentar moeda/percentual pt-BR. Exibir rótulo de negócio para enums das tarifas Studio; preservar valores da API e códigos quando necessários.
8. **UX09 — estados.** Sem conta selecionada na Conciliação, mostrar orientação para selecionar conta; não usar carregamento permanente. Diferenciar seleção inicial, carregamento real, sucesso vazio e erro recuperável. Não fingir que integrações indisponíveis estão conectadas.
9. **UX10 — documento.** Corrigir Nenhum documento institucional gerado quando DOCX/PDF estão disponíveis. Vincular status ao arquivo/versão correta e organizar dados de recebimento de peças e serviços em campos legíveis. Conferir valores e favorecidos sem alterar fontes, snapshots ou dados históricos. A tela deve concordar com o documento efetivamente emitido.
10. **Pendência de rede.** Reproduzir GETs auxiliares 500 registrados em channels/contracts/proposals e correlacionar logs e parâmetros. A repetição da auditoria retornou 200. Não atribuir causa sem evidência, não ocultar falhas como lista vazia e não modificar a segurança para fazê-las desaparecer. Se a causa ultrapassar esta tarefa visual, documentar e separar a correção.

## Bloco 3 — organização

11. **UX06 — Studio.** Substituir os três grandes indicadores por resumo compacto, preservando total/filtrados/colunas. Uma única paginação e um único seletor de itens por página. Em 390 px, a lista deve ser acessível sem percorrer três cartões redundantes. Aplicar ao explorador compartilhado e verificar as 28 tabelas.
12. **UX07 — colaboradores.** Manter painel da área na entrada; nas telas filhas, navegação compacta com estado atual e conteúdo de trabalho em primeiro plano. Nenhuma permissão ou ação pode desaparecer por mudança de layout.
13. **UX11 — redação.** Remover instruções de implementação como sem refatorar o módulo financeiro e backend. Explicar a tarefa e suas restrições em português claro. Não alterar nomes ou descrições cadastrais em lote.
14. **S01 a S05 — acabamento posterior.** Priorizar os dados do contrato, orientar vazios existentes e reduzir bordas/cartões aninhados e ações repetidas. Manter fonte de sistema, cores institucionais e hierarquia previsível. Não reduzir o corpo do texto para compensar densidade.

## Critérios de aceite comuns

- Testes reais Playwright em **1366 × 900** e **390 × 844**, zoom 100%, DPR 1, modos claro e escuro. Verificar Neblina e ao menos os componentes alterados em Marfim/Mineral/Grafite.
- Registrar antes/depois com rota, tema, dimensão, dados fictícios e passos. A galeria de 04/11/2026 fornece a referência original.
- Não haver rolagem horizontal do documento, controles encobertos, indicadores estreitos ou textos cortados. Rolagem local legítima de tabela deve ter identificação acessível e não bloquear teclado.
- Nomes acessíveis, foco visível, Tab/Shift+Tab/Esc nos diálogos e retorno de foco. Medir contraste de texto normal/estados relevantes; validar manualmente combinações que a medição não resolve.
- Testar carregamento, vazio, erro e recuperação. Confirmar busca, ordenação, paginação, exportação e seleção de colunas onde houver alteração.
- Repetir as quatro etapas da proposta, seleção/desmarcação TOF/TM/TB, confirmação de duplicidades, remoção e recuperação de rascunho. Não converter espera assíncrona do coletor em falso relato de perda.
- Gerar uma nova proposta de teste, confirmar total/entrada/valores por emitente, comparar resumo com PDF/DOCX e comprovar que observações internas ficam fora do conteúdo do cliente. Não enviar a terceiros nem alterar documentos antigos.
- Rodar typecheck/lint e regressões pertinentes conforme os scripts reais do repositório após correções relevantes; acrescentar testes úteis para datas e teclado. Não criar testes que apenas espelham classes CSS.
- Comparar integridade de registros antigos e usuários/permissões antes/depois, sem intervir na base principal. Restaurar tema inicial das sessões de teste.
- Atualizar a matriz e relatório com o que passou, o que falhou e o que ficou bloqueado por perfil/dados. Não declarar portais CLIENT/TECHNICIAN avaliados com a sessão ADMIN.

Entregar resumo das correções, evidências comparativas, testes executados, riscos restantes e pendências fora de escopo. Não declarar conclusão de acessibilidade ou homologação integral sem evidências correspondentes.
