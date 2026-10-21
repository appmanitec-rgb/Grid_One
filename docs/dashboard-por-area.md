# Dashboard por usuário e departamento

## Comportamento

- Administradores e gestores mantêm a visão gerencial/comercial, com indicadores adicionais dos departamentos autorizados.
- Suprimentos, Compras e Almoxarifado recebem pedidos em acompanhamento, entregas atrasadas, O.S. com materiais a separar, reposição de estoque, validade de produtos, EPIs e solicitações de compra.
- Financeiro, RH, Planejamento, Técnico e Assistente Administrativo recebem os indicadores e atalhos das suas telas liberadas. Solicitações comuns são limitadas ao solicitante e O.S. de técnicos são limitadas ao responsável.
- O servidor resolve o contexto com o usuário autenticado, o departamento cadastrado e as permissões de tela/ação. O departamento enviado pelo navegador não altera o escopo. O painel não amplia as permissões dos usuários.
- A visão de Suprimentos não consulta propostas comerciais, contas financeiras ou dados pessoais dos colaboradores. EPIs exibem dados operacionais limitados, sem funcionário, termo assinado ou informações salariais. O acesso completo ao RH permanece sujeito à permissão correspondente.

## Indicadores de cada departamento

| Perfil | Pendencias apresentadas |
| --- | --- |
| Suprimentos / Almoxarifado | Pedidos, entregas atrasadas, materiais de O.S. a separar, estoque minimo, validade de lotes e EPIs. |
| Compras | Solicitacoes, cotacoes abertas, cotacoes aguardando aprovacao, pedidos em preparacao e entregas. |
| RH | Documentos e certificacoes vencidos / vencendo em 30 dias, colaboradores ativos e sem documentos cadastrados, EPIs, apontamentos abertos ha mais de 24h, comissoes pendentes e frota indisponivel. |
| Financeiro | Contas abertas, vencidas e vencimentos de hoje / proximos 7 dias, conciliacao pendente e notas de compra para validar. |
| Planejamento | Agenda de hoje, programacao passada, O.S. sem tecnico / sem data, chamados com prazo vencido e laudos em elaboracao / revisao. |
| Tecnico | Suas O.S., sua agenda, seus chamados e laudos pendentes. Nunca recebe a fila de outros tecnicos. |
| Assistente administrativo | Documentacao, apontamentos e apoio ao RH, combinados com a agenda de contas a pagar e receber. Sem permissao adicional para pagar ou conciliar. |
| Comercial | Mantem a carteira, pipeline e prioridades do painel comercial existente. |
| Administracao / Diretoria | Mantem a visao geral e agrega os departamentos autorizados. |

As listas mostram ate cinco pendencias e os totais contam todos os registros do escopo. A ausencia de documentos cadastrados e um indicador de cadastro, nao uma afirmacao de que faltam documentos obrigatorios. Datas nao cadastradas nao sao inventadas. Colaboradores inativos e contas externas nao entram nos alertas documentais de RH. Apontamentos abertos nao sao encerrados automaticamente.

A leitura de documentacao exige a mesma autorizacao de certificacoes utilizada pelo cadastro. Dados bancarios, salarios, documentos pessoais, metadados e anexos privados nao sao incluidos nos novos resumos. Os chamados restritos abrem no portal tecnico. As agendas usam o dia de Brasilia; vencimentos documentais e financeiros usam a data de calendario cadastrada.

Esta ampliacao usa somente consultas nas tabelas existentes: nao cria migracao nem modifica cadastros, permissoes ou registros operacionais.

## Separação de materiais

A migração aditiva 20261021170000_dashboard_material_separation acrescenta separatedAt, opcional, em maintenance_order_materials. A fila considera O.S. abertas/em andamento, materiais físicos não aplicados e ainda não separados. A confirmação exige reserva prévia e permissão de reserva de estoque para o operador de Suprimentos/Almoxarifado. A operação é auditada e idempotente; não reserva, baixa ou consome material automaticamente.

## Validade de produtos

O painel permite cadastrar e encerrar o acompanhamento de validade por produto/lote. Reutiliza catalog_item_identifiers com origem PRODUCT_EXPIRY e validUntil; validades de propostas, preços e outros códigos não são tratadas como vencimento físico. A busca retorna no máximo dez produtos físicos, sem custos. O registro e encerramento exigem estoque e visualização/edição do catálogo, com auditoria.

Esse acompanhamento é manual e documental: não altera saldos nem substitui a movimentação física por lote. O operador deve atualizar a validade ou encerrar o acompanhamento ao consumir/retirar o lote. Sem datas cadastradas, o painel informa a ausência do cadastro. Os alertas distinguem vencidos e vencimentos nos próximos 30 dias.

## Validação

- 30 testes unitários/regressões aprovados: contexto de área, permissões, estoque disponível, solicitações pessoais, O.S. atribuídas, privacidade dos EPIs e separação.
- Nove testes por API aprovados em gridone_e2e: sete perfis departamentais e Administrador; documentos vencidos no RH; agenda financeira; distribuicao do Planejamento; trabalho proprio do tecnico; bloqueios; separação idempotente sem movimentar estoque; validade por lote sem duplicar registro e busca filtrada de até dez produtos.
- Tipos, lint do novo backend/interface e build isolado do frontend conferidos. Evidências privadas em runtime-logs/dashboard-area-*.

## Implantação

Ativo no ambiente local em 21/10/2026, nas portas 3000/3001. Backup completo verificado e migração aditiva aplicada. Os 59.647 registros das 150 tabelas existentes mantiveram os mesmos hashes, sem divergências. Os quatro usuários e suas permissões foram preservados; nenhum dado de teste foi criado na base operacional.

Os builds operacionais da API e da interface passaram. A conferência autenticada dos usuários reais de Administrador e Suprimentos confirmou os contextos EXECUTIVE e SUPPLIES, respectivamente, inclusive pelo proxy da interface. As rotas responderam HTTP 200. Evidências privadas em runtime-logs/dashboard-deployment-current.json e no diretório de implantação nele indicado.

Atualize o navegador com Ctrl+F5 para carregar a nova interface. O campo novo pode permanecer no banco numa reversão de interface, sem excluir dados.

## Ampliacao departamental concluida em 21/10/2026

Os sete perfis foram verificados por API na base gridone_e2e (nove cenarios aprovados), junto com 30 testes unitarios/regressoes. Os builds operacionais da API e das 94 paginas da interface passaram, assim como o lint dos arquivos alterados. A conferencia do bundle confirmou a acentuacao correta dos textos JSX do painel.

A nova versao esta ativa localmente nas portas 3000/3001, com respostas HTTP 200 da interface, API e proxy autenticado para Administrador e Suprimentos. O backup completo foi verificado antes da troca; os hashes dos 59.647 registros das 150 tabelas continuaram identicos, sem migracao adicional. Os quatro usuarios existentes e suas permissoes foram preservados. Nao foram criados usuarios ou documentos de teste na base operacional. Esta verificacao nao afirma disponibilidade publica externa nem inclui inspecao visual em navegador.
