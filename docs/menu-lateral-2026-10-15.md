# Menu lateral — 15/10/2026

- Cabeçalho lateral e barra superior usam a mesma altura de 72 pixels, o mesmo fundo e a mesma linha inferior.
- Cabeçalho da navegação mostra somente a logo, com acesso à página inicial. A seta de expandir/recolher foi removida.
- Menu compacto por padrão; expande com o mouse e recolhe ao sair. A abertura também acompanha o foco de teclado.
- Em dispositivos sem mouse, a navegação lateral visível permanece aberta para permitir toque. No celular, permanece o menu completo existente.
- Somente um bloco de rotinas pode ficar aberto. Ao navegar, o bloco da página atual é selecionado. Preferências antigas com vários blocos abertos deixam de interferir.
- Links dos blocos fechados saem da sequência de Tab. Permissões, favoritos, contadores, perfil e saída continuam disponíveis.

## Verificação

Oito cenários aprovados em base isolada: alinhamento, mouse e sanfona em 1366, 1024 e 768 pixels; teclado; tablet com toque; acesso do técnico; menu do celular e suas permissões. A captura de 1366 pixels foi repetida aguardando a logo terminar de carregar. Capturas do menu compacto e expandido inspecionadas visualmente.

Resultados em runtime-logs/sidebar-hover-combined-results.json. Compilação isolada e TypeScript aprovados; lint dos componentes sem erros ou avisos. Alterações locais, sem commit ou envio ao GitHub.

## Ajuste de desempenho da abertura

A animação anterior alterava a largura do menu dentro do layout flex e modificava a estrutura dos itens ao passar o mouse. Isso redimensionava a página, disparando também o observador de tamanho do resumo financeiro.

O menu agora mantém uma faixa de 80 pixels no desktop. O painel de navegação abre sobre o conteúdo, abaixo da barra superior, com movimento de 150 ms e opacidade de 110 ms. A estrutura dos itens permanece montada e usa memoização. A navegação fechada fica inerte e fora da leitura assistiva. Preferência por movimento reduzido, toque e sanfona continuam atendidos.

Nove testes aprovados na bateria final: os oito cenários anteriores e uma verificação de aberturas repetidas na proposta, acompanhando a geometria da página por quadros, a preservação dos elementos e a posição do resumo financeiro. A inspeção inicial identificou um conflito de sobreposição com uma regra global de camadas; corrigido antes da bateria final.

Evidências: runtime-logs/sidebar-smooth-final-results.json, sidebar-smooth-final-tests.log e sidebar-smooth-initial-error.md. Compilação isolada, TypeScript e lint aprovados. Captura final do painel aberto inspecionada visualmente.
