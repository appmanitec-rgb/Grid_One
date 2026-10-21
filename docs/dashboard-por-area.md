# Dashboard por usuário e departamento

## Comportamento

- Administradores e gestores mantêm a visão gerencial/comercial, com indicadores adicionais dos departamentos autorizados.
- Suprimentos, Compras e Almoxarifado recebem pedidos em acompanhamento, entregas atrasadas, O.S. com materiais a separar, reposição de estoque, validade de produtos, EPIs e solicitações de compra.
- Financeiro, RH, Planejamento, Técnico e Assistente Administrativo recebem os indicadores e atalhos das suas telas liberadas. Solicitações comuns são limitadas ao solicitante e O.S. de técnicos são limitadas ao responsável.
- O servidor resolve o contexto com o usuário autenticado, o departamento cadastrado e as permissões de tela/ação. O departamento enviado pelo navegador não altera o escopo. O painel não amplia as permissões dos usuários.
- A visão de Suprimentos não consulta propostas comerciais, contas financeiras ou dados pessoais dos colaboradores. EPIs exibem dados operacionais limitados, sem funcionário, termo assinado ou informações salariais. O acesso completo ao RH permanece sujeito à permissão correspondente.

## Separação de materiais

A migração aditiva 20261021170000_dashboard_material_separation acrescenta separatedAt, opcional, em maintenance_order_materials. A fila considera O.S. abertas/em andamento, materiais físicos não aplicados e ainda não separados. A confirmação exige reserva prévia e permissão de reserva de estoque para o operador de Suprimentos/Almoxarifado. A operação é auditada e idempotente; não reserva, baixa ou consome material automaticamente.

## Validade de produtos

O painel permite cadastrar e encerrar o acompanhamento de validade por produto/lote. Reutiliza catalog_item_identifiers com origem PRODUCT_EXPIRY e validUntil; validades de propostas, preços e outros códigos não são tratadas como vencimento físico. A busca retorna no máximo dez produtos físicos, sem custos. O registro e encerramento exigem estoque e visualização/edição do catálogo, com auditoria.

Esse acompanhamento é manual e documental: não altera saldos nem substitui a movimentação física por lote. O operador deve atualizar a validade ou encerrar o acompanhamento ao consumir/retirar o lote. Sem datas cadastradas, o painel informa a ausência do cadastro. Os alertas distinguem vencidos e vencimentos nos próximos 30 dias.

## Validação

- 23 testes unitários/regressões aprovados: contexto de área, permissões, estoque disponível, solicitações pessoais, O.S. atribuídas, privacidade dos EPIs e separação.
- Seis testes por API aprovados em gridone_e2e: perfis de Suprimentos, Administrador, Financeiro e Assistente; bloqueios; separação idempotente sem movimentar estoque; validade por lote sem duplicar registro e busca filtrada de até dez produtos.
- Tipos, lint do novo backend/interface e build isolado do frontend conferidos. Evidências privadas em runtime-logs/dashboard-area-*.

## Implantação

Ativo no ambiente local em 21/10/2026, nas portas 3000/3001. Backup completo verificado e migração aditiva aplicada. Os 59.647 registros das 150 tabelas existentes mantiveram os mesmos hashes, sem divergências. Os quatro usuários e suas permissões foram preservados; nenhum dado de teste foi criado na base operacional.

Os builds operacionais da API e da interface passaram. A conferência autenticada dos usuários reais de Administrador e Suprimentos confirmou os contextos EXECUTIVE e SUPPLIES, respectivamente, inclusive pelo proxy da interface. As rotas responderam HTTP 200. Evidências privadas em runtime-logs/dashboard-deployment-current.json e no diretório de implantação nele indicado.

Atualize o navegador com Ctrl+F5 para carregar a nova interface. O campo novo pode permanecer no banco numa reversão de interface, sem excluir dados.
