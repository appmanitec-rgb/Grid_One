# Campos de seleção e pesquisa

Listas com mais de dez opções usam busca e exibem no máximo dez resultados por vez. A pesquisa continua considerando todos os registros disponíveis.

- Use `SelectField` no lugar de `select`. O componente aplica a busca automaticamente quando há mais de dez opções.
- Para clientes, equipamentos, produtos e outros cadastros, use também `searchable` para oferecer busca desde o início.
- Use `SuggestionInput` quando o campo aceitar valores livres, como uma condição de pagamento especial. As sugestões também ficam limitadas a dez.
- Use `SearchLookup` nas buscas remotas. Solicite `take=10` ao servidor, mantenha a busca por todo o cadastro e preserve o registro selecionado.
- `CatalogSearchField` já usa esse padrão para produtos e serviços.

Os campos compartilham pesquisa sem distinção de acentos ou maiúsculas, navegação por teclado, fechamento com Escape e apresentação dos resultados fora de áreas que possam cortá-los. Uma busca abandonada preserva o valor escolhido; trocar o cliente continua limpando o equipamento do cliente anterior.

## Verificação

`frontend/e2e/searchable-fields.spec.ts` verifica a escolha de registros depois dos dez primeiros, o limite visível, os vínculos salvos no chamado, o funcionamento em celular, as condições livres e a pesquisa de produtos no servidor.
