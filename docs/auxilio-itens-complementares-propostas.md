# Auxílio de itens complementares em propostas

Na proposta comum, a seção **Conferência de itens complementares** observa as peças do catálogo, os itens vindos da máquina e os itens avulsos. Uma regra ativa compara um termo da peça com um acessório esperado. Se o acessório não estiver presente na quantidade sugerida, o vendedor recebe uma pergunta antes de salvar.

Exemplo inicial: ao incluir uma **mangueira**, o sistema pergunta se são necessárias **abraçadeiras**. O vendedor pode incluir uma opção com preço cadastrada no catálogo, buscar a peça manualmente ou registrar por que não se aplica. A justificativa precisa ter pelo menos oito caracteres, é reaberta se os itens mudarem e é gravada nas observações internas da proposta. O aviso não adiciona peças nem altera preços sem uma ação do vendedor.

## Configurar outras perguntas

Em **Manitec Studio → Dados / Tabelas → Lembretes de itens complementares**, um usuário com permissão de edição do Studio e de propostas pode criar ou ajustar uma regra:

- **Quando o item contém:** termo que identifica a peça de origem, como `MANGUEIRA`.
- **Acessório a conferir:** termo pesquisado no catálogo, como `Abraçadeira`.
- **Pergunta ao vendedor:** texto do aviso.
- **Qtd. por unidade:** quantidade mínima sugerida para cada unidade da peça de origem, entre 1 e 20.
- **Ativo:** liga ou desliga o lembrete sem apagar seu cadastro.

Os termos ignoram diferenças de maiúsculas e acentos na comparação dos itens da proposta. O código da regra é único por termo de origem; se uma peça exigir vários acessórios, use termos de origem mais específicos ao criar as regras. As sugestões são perguntas de conferência técnica, e a quantidade final permanece decisão da equipe responsável.

O sistema bloqueia o salvamento apenas enquanto os lembretes não foram carregados ou enquanto uma pergunta ativa estiver sem resposta. A regra inicial foi aplicada pela migration `20261006180000_proposal_accessory_reminder`.
