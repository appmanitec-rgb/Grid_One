# Revisão visual do GridOne — 14/10/2026

## Alcance

Inventário de **108 páginas**: 86 internas, 16 da central do cliente, 3 de acesso e 3 de compartilhamento/validação pública.

A verificação percorre 98 telas renderizadas em 1366, 768 e 390 pixels, seis acessos públicos em 1366 e 390 pixels e quatro redirecionamentos. Formulários de proposta também são conferidos em 1024 e 683 pixels; os cabeçalhos principais, em 768 pixels.

Dados e usuários de teste pertencem ao banco separado `gridone_e2e`. Nenhum cliente, cobrança ou pedido novo foi criado na base real nesta revisão.

## Padrão aplicado

| Elemento | Resultado |
| --- | --- |
| Cabeçalho | Título, descrição, contexto e ações no mesmo componente, sem grandes banners vazios. |
| Tipografia | Manrope, tamanhos legíveis e números financeiros alinhados. |
| Ações | Botões principais com a cor da marca; alertas e ações destrutivas mantêm sua distinção. |
| Indicadores | Duas colunas no celular; traço durante o carregamento em 12 módulos. |
| Formulários | Campos legíveis, foco visível e largura adaptável. Propostas mantêm etapas e resumo financeiro. |
| Listas | Filtros largos abaixo do título; 31 tabelas existentes permitem rolagem por teclado. |
| Estados | Carregamento, vazio, erro e confirmação com apresentação comum na central do cliente. |
| Documentos | Barra de consulta e downloads padronizada; o conteúdo documental continua separado das ações de operação. |
| Navegação | Perfil acessível pelo avatar e menu completo com busca no celular. |

## Correções encontradas na inspeção

- Filtros de programação ultrapassavam a área de conteúdo em 128 pixels no desktop. Ações e filtros passaram para uma linha própria.
- Controles de recebimento de pedidos de compra ultrapassavam a área de conteúdo em 70 pixels no celular. Agora se distribuem verticalmente quando falta espaço.
- Em tablet, filtros de vistorias, custos, centros de custo e permissões, projeções do fluxo de caixa e o histórico dos laudos ultrapassavam a área disponível. As grades agora se adaptam ao conteúdo e os campos respeitam a largura do bloco.
- Selos de certificação na programação ficavam apertados dentro dos cartões dos técnicos. O radar passou a distribuir suas informações pela largura do cartão.
- A barra inferior do celular não oferecia todos os menus. O novo menu usa os mesmos itens e a mesma política de acesso do painel.
- Recorrência e cobertura apareciam como `MONTHLY` e `BILLED_SEPARATELY` no documento do contrato. A apresentação agora usa rótulos em português, preservando os valores da API.
- Status e categorias em cadastros, sessões técnicas, documentos e financeiro receberam rótulos legíveis. Dinheiro e pagamento à vista usam rótulos adequados a cada contexto.
- Textos corrompidos do feedback foram corrigidos; campos receberam associação explícita com os rótulos, contador e confirmação de envio.
- Atalhos de chamados, ordens e contratos no cadastro do cliente agora preenchem a busca com a empresa selecionada.
- Textos que descreviam a implementação foram substituídos por orientações de uso.

## Verificação final

- **33 testes aprovados**, consolidados pelo resultado mais recente de cada cenário.
- **294 verificações de telas**: 98 em cada largura, sem excesso horizontal, duplicidade de título ou os códigos de apresentação verificados.
- Doze visitas aos seis acessos públicos e quatro redirecionamentos conferidos.
- Compilação de produção e TypeScript aprovados; lint sem erros, com sete avisos não bloqueantes.

## Evidências e limites

Os resultados finais estão consolidados em `runtime-logs/visual-combined-results.json`, preservando os relatórios das execuções em `visual-final-browser-results.json` e `visual-responsive-results.json`. Os inventários e capturas selecionadas estão em [revisao-visual-2026-10-14](revisao-visual-2026-10-14). A primeira inspeção permanece registrada em `runtime-logs/visual-browser-results.json` e `runtime-logs/visual-first-audit`.

Os testes verificam carregamento, título único, padrão do cabeçalho, largura, rótulos e navegação. Capturas representativas também foram inspecionadas visualmente. A cobertura corresponde aos tamanhos, perfis, registros e fluxos descritos acima. Tabelas extensas preservam rolagem dentro de sua própria área. O compartilhamento genérico foi conferido com link inválido; documentos e laudos liberados foram conferidos com registros de teste válidos.

## Reproduzir

1. Compilar o frontend com `E2E_DIST_DIR=1` e API em `127.0.0.1:3100`.
2. Executar `scripts/start-e2e.ps1 -ProductionBuild`.
3. Executar `scripts/test-e2e.ps1 -Specs e2e/visual-system.spec.ts,e2e/visual-interactions.spec.ts`.
4. Encerrar a cópia com `scripts/stop-e2e.ps1`.

As alterações desta repaginação permanecem locais, sem commit ou envio ao GitHub.

## Capturas

- [Propostas no desktop](revisao-visual-2026-10-14/dashboard-proposals-1366.png)
- [Propostas no celular](revisao-visual-2026-10-14/dashboard-proposals-390.png)
- [Menu completo no celular](revisao-visual-2026-10-14/menu-celular.png)
- [Central do cliente](revisao-visual-2026-10-14/portal-dashboard-1366.png)
