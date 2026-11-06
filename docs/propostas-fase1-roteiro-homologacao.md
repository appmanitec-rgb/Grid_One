# Central de Propostas — roteiro de homologação visual e do vendedor

Data: 23/10/2026. **Todos os testes deste roteiro estão pendentes de execução humana ou de navegador automatizado.** Os resultados de regras e API estão no [relatório](propostas-fase1-validacao.md); não substituem os testes abaixo.

## Ambiente e registro

- Usar somente `http://127.0.0.1:3002/dashboard/proposals`, API 3005 e base `gridone_proposals_f1_20261023`. Não usar 3000/3001 ou a base principal.
- Conferir a instância antes de começar: fixtures têm identificação F1, entregas externas estão desativadas. Não enviar mensagens reais, cadastrar cobranças reais ou efetuar pagamentos reais.
- Entrar com uma conta da cópia isolada. Para testar alçadas, preparar nela um vendedor com limite de 5%, outro com 10% e um aprovador autorizado. Não alterar usuários na base principal.
- Executar **cada caso em 1366 × 768 e em 390 × 844, zoom do navegador 100%**. Registrar largura em pixels CSS, navegador/versão, escala da tela e zoom. Não usar redução de zoom para esconder problemas de layout.
- Repetir a inspeção dos quatro passos, sobreposições e mensagens nos temas claro e escuro existentes.
- Registrar por caso: responsável, data/hora, resultado, captura ou vídeo, código do rascunho/proposta de teste e defeito encontrado. Nunca anexar tokens ou senhas.
- Para falhas de rede, interromper apenas requisições para a API isolada pelas ferramentas do navegador. Não parar serviços principais.

## Preparação de dados

Na cópia isolada, usar cliente liberado, equipamento vinculado ao cliente e pelo menos 12 itens vinculados ao equipamento. Incluir filtros/óleo (TOF), mangueiras/abraçadeiras/aditivo (TM), bateria (TB) e um serviço cadastrado. Conferir que o kit TB não inclui carregador ou acessórios.

Usar preços conhecidos de R$ 69,30 para uma peça e R$ 440,00 para um serviço. Para o caso financeiro, configurar duas contas ativas de finalidades corretas: peças na empresa A e serviços na B, cada favorecido com o CNPJ de seu próprio emitente. Usar dados fictícios identificados como F1. O ensaio automatizado já criou exemplos na cópia; não reutilizar proposta concluída como rascunho editável.

## Casos obrigatórios

| ID | Ação | Resultado esperado | Situação |
| --- | --- | --- | --- |
| V01 | Abrir carteira e nova proposta com rede normal e lenta. | Carregamento compreensível; ausência de salto que esconda controles, erro falso ou tela vazia. | Pendente |
| V02 | Percorrer Dados comerciais → Peças → Serviços → Revisão, voltar e usar os indicadores das etapas. | Quatro passos preservados; nenhum campo, item, seleção ou valor perdido. Foco acompanha a etapa. | Pendente |
| V03 | Preencher cliente, equipamento e vendedor por pesquisa, inclusive sem resultado e com mais de 10 correspondências. | Lista pesquisável, até 10 resultados visíveis, seleção identificável; equipamento pertence ao cliente. Texto digitado sem selecionar não vale como cadastro escolhido. | Pendente |
| V04 | Salvar sem cliente e sem itens em cada etapa. Recarregar. | Rascunho salvo e recuperado na mesma etapa; nenhuma proposta comercial, aprovação, O.S. ou recebível criado. | Pendente |
| V05 | Digitar uma alteração e recarregar imediatamente, antes de 600 ms; repetir navegando por link interno. | Última edição recuperada no mesmo navegador, ou bloqueio explícito quando a cópia não puder ser preservada. | Pendente |
| V06 | Salvar no servidor e abrir o rascunho em outro navegador autenticado como o mesmo usuário. | Recuperação da versão salva no servidor; não anunciar como salva uma edição que exista apenas localmente. | Pendente |
| V07 | Abrir mesmo rascunho em duas abas. Salvar A, editar B, tentar salvar B e recarregar B. | Conflito explícito; B não sobrescreve A. Edição local de B permanece visível. “Reabrir versão do sistema” exige ação e preserva uma cópia separada. | Pendente |
| V08 | Interromper rede ao recuperar e ao salvar; restaurar rede e tentar novamente. | Erro claro, conteúdo preservado, recuperação/gravação repetível; nenhuma falsa confirmação ou duplicação. | Pendente |
| V09 | Simular indisponibilidade de armazenamento local; sair com edição não salva. | Aviso e proteção contra perda quando a cópia não puder ser gravada; gravação no servidor continua identificável. | Pendente |
| V10 | Concluir solicitação de aprovação; retornar pelo histórico do navegador à URL antiga do rascunho. | Não recriar cópia local obsoleta nem permitir editar proposta já liberada; orientar revisão/retorno à carteira. | Pendente |
| V11 | Na etapa Peças abrir “Adicionar itens do equipamento”; selecionar e desmarcar TOF, TM e TB. | Itens correspondem ao cadastro; bateria sem acessórios; é possível desmarcar; seleção individual preservada conforme conjunto. | Pendente |
| V12 | Pesquisar/paginar e selecionar 12 itens. Abrir conferência; cancelar e depois confirmar. | Conferência contém todos os selecionados, mesmo fora da página atual; cancelar não insere; confirmar insere uma vez. | Pendente |
| V13 | Inserir item já presente; testar somar, separar com justificativa e cancelar; depois desfazer. | Soma somente em contexto/preço idênticos; separação exige justificativa; cancelar e desfazer mantêm quantidades anteriores. Não somar preços distintos silenciosamente. | Pendente |
| V14 | Alterar quantidades/preços após justificar uma duplicata. | Conferência aplicável é invalidada quando os fatos mudam. Campo de correção retorna ao passo correto. | Pendente |
| V15 | Preencher serviços, horas e tarifas; alterar equipamento e materiais após gerar escopo. | Regras anteriores preservadas; material não contrata serviço automaticamente. Escopo desatualizado é indicado; ajuste manual exige conferência interna. | Pendente |
| V16 | Preencher despesas com quantidade usual e atípica. Testar desconto protegido e autorizado sobre despesas. | Aviso de quantidade atípica sem inventar equipe/dias; desconto respeita elegibilidade. Totais coerentes entre passos, revisão e prévia. | Pendente |
| V17 | Usar vendedor 5% e 10%; preparar desconto dentro/acima da alçada e desconto reduzindo preço do catálogo. | Alçada correta, considerando descontos em conjunto. Rascunho preservado acima da alçada; liberação exige aprovador autorizado. | Pendente |
| V18 | Testar à vista, entrada em valor/percentual, parcelamento, centavo residual e condição especial. Informar entrada superior ao total e plano inconsistente. | Resumo reflete valores reais; inconsistências são dirigidas ao campo correto; liberação inválida bloqueada. | Pendente |
| V19 | Na revisão corrigir pendências dos sete grupos, justificar caso aplicável e alterar os fatos novamente. | Mensagem, etapa e foco corretos; justificativas internas não liberam pendência diferente; carregamento não anuncia aprovação antes da conferência. | Pendente |
| V20 | Abrir prévia antes de aprovar; fechar por botão, Escape e teclado. | Prévia abre sem enviar/publicar; formulário continua preenchido. Foco retorna ao controle anterior. Conferir legibilidade do PDF em ambas as larguras. | Pendente |
| V21 | Comparar lado a lado prévia, PDF emitido, DOCX e portal. Usar observação externa e nota interna distintas. | Mesmos itens, quantidades, escopo, despesas, desconto, total, pagamento, contas e condições. Observação externa visível onde previsto; nota/justificativa interna ausente. Status de rascunho/aprovação pode mudar; conteúdo comercial não. | Pendente |
| V22 | Aprovar; depois alterar tarifa/catálogo e publicar outro modelo somente na cópia. Baixar novamente. | Documento aprovado permanece congelado; mudanças futuras não alteram seu conteúdo. Repetir com modelo Word publicado usado na operação. | Pendente |
| V23 | Escolher conta inativa, de finalidade errada e de favorecido incompatível com o emitente. | API e tela recusam cada combinação, com orientação útil, preservando o restante do formulário. | Pendente |
| V24 | Peça de R$ 69,30 + serviço de R$ 440,00, emitentes A/B, entrada R$ 100 e 3 parcelas. | Aviso de empresas diferentes; contas dos dois CNPJs conferíveis. Total R$ 509,30; saldo R$ 409,30; parcelas R$ 136,43 + R$ 136,43 + R$ 136,44. Financeiro confere destinação: não existe rateio fiscal automático criado nesta fase. | Pendente |
| V25 | Aceitar a proposta anterior; programar vencimentos e repetir a ação. Informar datas fora de ordem e quantidade incorreta. | Títulos corretos, sem duplicação; datas inválidas recusadas. Entrada pendente impede O.S.; não há baixa de estoque só pela aprovação. | Pendente |
| V26 | Testar vendedor sem permissão de aprovar e gestor com alçada insuficiente; tentar duplo clique nas ações. | Proibição clara; nenhuma transição/envio duplicado; ações não autorizadas não ficam liberadas pela interface. | Pendente |
| V27 | Percorrer tudo usando Tab, Shift+Tab, Enter, Espaço e Escape. Testar combobox, conjuntos, revisão, modal e PDF. | Ordem de foco lógica e visível; sem fuga/trava em sobreposição; rótulos e erros associados. Leitor de tela anuncia carregamento, erro e confirmação. | Pendente |
| V28 | Em 390 px verificar os quatro passos, painel financeiro fixo, teclado móvel, listas e sobreposições. | Sem rolagem horizontal da página; botões e textos não cortados; rodapé não cobre campo/ação, inclusive com teclado aberto. | Pendente |
| V29 | No tema escuro verificar inputs, listas, mensagens, foco, revisão e sobreposições. | Contraste legível e cores consistentes; sem quadros brancos indevidos ou texto invisível. | Pendente |
| V30 | Com a flag desligada na cópia, testar proposta de peças/serviços; também abrir geradores, contratos, propostas externas e documentos históricos. | Fluxos anteriores acessíveis e íntegros; sem exigência retroativa de conferência para documentos históricos. Não alterar servidores principais para testar. | Pendente |

## Critério para liberar implantação

Executar e registrar os casos nas duas resoluções com zoom de 100%, corrigir defeitos impeditivos e repetir os cenários afetados. Conferir com o Financeiro o caso dos dois emitentes e com o vendedor a recuperação de conflitos. Nenhum teste pendente pode ser tratado como aprovado por inferência a partir da API.

**Parecer atual: implantação reprovada enquanto a validação visual/experiência permanecer pendente.** Este roteiro não autoriza commit, push, migração ou ativação em produção.
