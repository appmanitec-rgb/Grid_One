# Almoxarifado — posições e QR Code

Implementação e validação de 06/11/2026. Desenvolvimento na branch
`codex/warehouse-qr-20261106`, a partir de `792c5a1`.

## Uso previsto

O menu **Almoxarifado → Posições e QR Code** reúne os endereços de armazenagem.
Cada posição pertence a um almoxarifado e tem código único nesse almoxarifado,
descrição, corredor, estante, nível e compartimento. Exemplo: `A-01-02`.

1. Criar a posição e endereçar as peças do catálogo que ficam nela.
2. Selecionar posições e imprimir etiquetas com a marca Manitec, endereço legível
   e QR Code. Folha A4, duas colunas, etiquetas de 90 × 50 mm.
3. Escanear usando a câmera do celular. O link exige autenticação e retorna à
   posição após entrar. Também é possível colar o link ou digitar/ler o código
   em **Abrir etiqueta**.
4. Consultar as abas **Itens da posição**, **Reservas de clientes**, **Demandas**
   e **Histórico**, conforme as permissões do usuário.
5. Conferir o saldo físico, reservar antecipadamente para cliente, liberar uma
   reserva ou vinculá-la a um item compatível de pedido de venda existente.

As buscas de peças, clientes, posições e itens de pedidos são pesquisáveis e
retornam no máximo dez opções. Listas paginadas também exibem dez registros por
página. Quantidades em unidades inteiras não aceitam frações; unidades medidas
aceitam até seis casas decimais.

## Integração com as rotinas existentes

**Não há um segundo estoque.** A posição é um endereço do `InventoryBalance`
existente. Entradas, ajustes, reservas, transferências entre almoxarifados e saídas
continuam utilizando os mesmos saldos. O endereço novo aparece no estoque e na
ficha completa do item. O texto legado de localização é preservado.

Esta entrega trabalha com **uma posição de saldo por SKU em cada almoxarifado**.
Mover posição leva todo o saldo e as reservas daquele SKU no mesmo almoxarifado.
Transferências entre almoxarifados permanecem na rotina existente. Não representa
controle de quantidades do mesmo SKU distribuídas entre vários compartimentos.
Nenhum endereço foi deduzido ou atribuído automaticamente aos itens existentes.

Uma conferência sem diferença registra responsável e data, sem movimento de
estoque. Havendo diferença, exige motivo e atualiza o saldo oficial e o total do
catálogo, preservando custos. Não permite saldo físico abaixo do reservado.

Reservas antecipadas têm cliente, quantidade restante, previsão de uso e histórico.
Reduzem o disponível sem registrar saída ou faturamento. A passagem para um pedido
compatível do mesmo cliente não duplica a quantidade reservada e mantém a regra
de liberação financeira/entrada. Liberações genéricas do estoque não podem consumir
essas reservas. Não há cancelamento automático por vencimento da previsão.

As demandas mostram pedidos de venda, materiais pendentes de O.S. e solicitações
de compras, com quantidade e link para a origem. Respeitam as permissões e os
escopos dessas rotinas. Atendimento de O.S., separação, entrega, recebimento e
faturamento continuam nas telas existentes. O histórico da posição reúne as
operações desta nova rotina; os demais movimentos continuam na ficha do item.

## Permissões e segurança

- Nova tela autorizável `stockLocations`, dentro de Almoxarifado. Usa as ações
  existentes `inventory.create`, `update`, `adjust` e `reserve`, além da visualização.
- Contagem exige ajuste; reservar/liberar exige reserva; endereçar/mover exige
  atualização. Passagem para pedido também exige a autorização da tela de pedidos.
- A API valida as permissões independentemente dos botões. Um perfil de consulta
  não recebe opções de clientes nem pode confirmar ajustes por requisição direta.
- Nenhuma concessão automática de novas ações a usuários reais. A matriz deve ser
  configurada explicitamente pelo administrador para os colaboradores envolvidos.
- Custos, preços, margens e dados bancários não integram as respostas desta rotina.
- QR contém somente endereço privado e UUID estável da posição. Não contém token,
  cliente ou saldo. Renomear a posição não invalida o identificador da etiqueta.
- O retorno após login aceita apenas a rota privada de uma posição com UUID válido;
  não aceita redirecionamento externo ou arbitrário. O fluxo normal de MFA permanece.
- Confirmações usam chave de idempotência, transação serializável e verificação da
  versão do saldo. Repetir após perda da resposta não reaplica o movimento.
- Uma contagem com saldo alterado por outra pessoa é recusada, mantendo os valores
  digitados para conferência. Fechar uma janela com edição pendente exige descarte.
- Restrições no PostgreSQL protegem as reservas antecipadas também contra escritores
  antigos do estoque. Valores e registros existentes não são recalculados na migração.

## Validação executada

Ambiente separado: `gridone_warehouse_qr_20261106`, criado a partir de backup
verificado. API de teste em loopback 3006 e interface temporária 3004. Automação
agendada e entregas externas desabilitadas. Os registros criados são fictícios,
identificados como validação QR. O script de integração recusa execução fora de
`NODE_ENV=test`, banco local com prefixo `gridone_warehouse_` e nome esperado.

| Verificação | Resultado |
|---|---|
| Compilação API / Prisma isolado | Aprovada. |
| Compilação Next.js / TypeScript | Aprovada, artefato separado do principal. |
| Pacote do principal | Build `.next-release-warehouse-20261106-prod` aprovado e ativado após autorização; proxy `/api` aponta para a API interna 3000. |
| Testes backend completos | **721 aprovados em 89 suítes**. |
| Reteste das regras novas após ajustes finais | **28 aprovados**. |
| Integração com PostgreSQL real | **18 cenários aprovados**. |
| Primeira rodada de navegador real | **12 testes aprovados**. |
| Rodada final de navegador e regressão | **47 aprovados** em nove arquivos: 13 da rotina nova e 34 de regressão de login/MFA, navegação, permissões, propostas e recuperação. |
| Lint frontend dos arquivos envolvidos | Sem erros ou avisos após a correção do portal de pesquisa. |
| Lint backend | Varredura completa sem erros; seis avisos preexistentes em clientes. Arquivos novos corrigidos e retestados sem avisos. |
| Impressão | PDF A4, uma página com duas etiquetas; renderização inspecionada com Poppler, sem corte de logo ou QR. |

Os cenários PostgreSQL incluem idempotência, código duplicado, controle de tela,
endereçamento sem mudar saldo, contagem, conflito, unidades, reservas simultâneas,
liberação parcial, proteção das reservas nos fluxos antigos, ajustes e transferências
existentes, liberação financeira, passagem para pedido sem dupla reserva, demandas,
estoque integrado, mudança de posição, inativação, configuração concorrente do
endereço das etiquetas e desvinculação somente com saldo zerado.

No navegador foram usados Chromium, zoom de 100%, larguras **1366 e 390 px**, temas
claro e escuro. Foram exercitados contagem com resposta interrompida e repetição,
conflito de saldo, pesquisa dentro de diálogo nativo, Escape sem fechar o formulário,
limite de opções, perfil de consulta, retomada do QR após login e impressão.
A rodada final também criou e editou uma posição pelo formulário, verificou o
aviso de descarte e moveu todo o saldo de óleo para a posição nova e de volta,
preservando a quantidade. As quatro etapas e a recuperação de propostas foram
retestadas com APIs interceptadas, sem registros novos no principal.
Foi corrigido o portal compartilhado do campo pesquisável: dentro de um diálogo
nativo os resultados passam a pertencer ao próprio diálogo e continuam clicáveis.

Evidências locais, fora do Git: `runtime-logs/warehouse-qr-20261106/`, com logs de
compilação, testes, lint, resultados de integração e capturas em `screens/`.
O PDF e sua renderização são amostras de validação, com dados fictícios.

## Ativação e limites

**Ativado no principal em 06/11/2026, após a autorização explícita do usuário:
“Autorizar ativação na 3001”.** A autorização posterior resolveu a pendência de
implantação registrada ao concluir os testes isolados.

Com os serviços do Manitec parados, foi criado e verificado um novo backup
PostgreSQL custom: `backend/backups/20261106-175830_gridone_db_a1c52856.dump`, com
**6.719.448 bytes**, lista do `pg_restore` válida e SHA-256 conferido no manifesto
privado. A configuração da release anterior e os logs foram preservados.

Apenas a migração `20261106190000_warehouse_locations_qr` estava pendente e foi
aplicada. É aditiva: três tabelas novas, cinco campos opcionais em tabelas
existentes, índices, relação de posição com o mesmo almoxarifado e proteções de
reservas. O preflight passou: 113 migrações locais aplicadas, nenhuma pendente ou
com falha no histórico do banco.

A comparação de contagens e hashes, feita com os serviços parados, confirmou
**159 tabelas de dados existentes preservadas**. Os hashes posteriores usaram as
mesmas colunas originais para permitir a comparação após adicionar os campos
opcionais. Saldos, reservas, custos, usuários, permissões, documentos e demais
registros existentes não foram modificados pela migração. As três tabelas novas
estavam vazias e os cinco campos novos nulos. Somente o histórico de migrações
recebeu seu registro correspondente.

API, cliente Prisma e frontend compatíveis foram ativados conjuntamente:
`dist-release-warehouse-20261106`, `runtime-release-warehouse-20261106/client` e
`.next-release-warehouse-20261106-prod`. O manifesto registra a impressão digital
dos fontes locais validados. Não houve cópia da base de testes, seed, atribuição
de permissões ou criação de posições/reservas fictícias no principal. Essa ativação
ocorreu a partir dos arquivos locais validados, antes da publicação no GitHub.

Verificações após ativação:

- **14 verificações HTTP reais aprovadas**: saúde em produção, banco/storage,
  interface, portal do cliente, rota nova, consultas autenticadas de posições,
  opções, almoxarifados e estoque. Os endpoints privados retornaram 401 sem token.
- As três tabelas novas foram lidas pelo cliente Prisma da release ativa; os
  dois gatilhos de proteção foram encontrados; nenhuma migração incompleta.
- **26 testes de regressão aprovados na 3001**, com APIs interceptadas, cobrindo
  login/MFA, menu, permissões, responsividade e recuperação das propostas.
- **Duas verificações reais de navegador aprovadas**, 1366 px claro e 390 px
  escuro, zoom de 100%, sem erros JavaScript ou rolagem horizontal. Conferidos
  menu e listagem; o formulário foi preenchido e descartado sem salvar. Requisições
  de escrita foram bloqueadas no contexto desses testes, inclusive heartbeats.
  Os seletores desse roteiro foram ajustados ao título H1, contador do mapa e
  destino do link de busca; não houve correção de código de produto nessa etapa.
- Backend sem erros em stderr. O proxy registrou recusas de conexão durante a
  inicialização da API na janela de troca; o arquivo não recebeu novas entradas
  após a API ficar saudável durante as conferências seguintes.

Evidências da ativação: `runtime-logs/warehouse-activation-20261106/`, incluindo
manifesto do backup, inventário de integridade, logs da migração, smoke e capturas.
`runtime-logs/active-release.json` e `server-pids.json` identificam a versão ativa.
Os artefatos anteriores continuam disponíveis para retorno do código; não há
restauração automática da base de dados.

As instâncias temporárias 3004/3006 permanecem encerradas: há uma interface de
usuário na **3001**, com a API interna em loopback **3000**.

Antes de imprimir etiquetas para operação, cadastrar o **endereço do sistema nas
etiquetas** usando domínio ou IP de rede alcançável pelo celular. `localhost` e
`127.0.0.1` só funcionam no computador que gerou a etiqueta; a interface alerta
explicitamente. A mudança do domínio/IP exige reimpressão das etiquetas antigas.

Pendências operacionais: ensaio de leitura em celular físico na rede da empresa,
impressora e material adesivo efetivamente utilizados; conferência dos endereços
e contagem inicial; designação das permissões por colaborador. Não foram simulados
scanner físico, uso sem rede, leitor dedicado, lotes/validade por compartimento ou
split de saldo entre várias posições. Essas capacidades não estão implícitas no QR.

Parecer: implementação ativada e apta a piloto controlado após a configuração
de rede/perfis e dos endereços físicos. O teste em celular físico e a validação
da impressão permanecem requisitos operacionais antes de distribuir etiquetas
em todo o almoxarifado.
