# Perfis por área

Em **RH → Colaboradores e acessos**, selecione **Novo usuário** ou abra uma conta em **Controle / Permissões**. O campo **Perfil por área** preenche cargo, departamento e permissões. Revise os dados e clique em **Criar usuário**, **Salvar alterações** ou **Salvar permissões**, conforme a tela.

Escolher um modelo prepara uma alteração. As contas existentes só mudam depois de salvar. Os três administradores continuam com acesso total. Os modelos não criam usuários nem possuem credenciais compartilhadas.

| Perfil | Escopo inicial |
| --- | --- |
| Suprimentos | Catálogo, estoque, reservas, consumo, ajuste e recebimento de compras. Consulta de fornecedores, clientes, equipamentos e O.S. |
| Compras | Fornecedores, cotações e criação, edição e cancelamento de pedidos. Sem aprovação ou recebimento. |
| RH | Colaboradores, dados sensíveis de pessoal, documentos, certificações, ponto, ferramentas, comissões e frota. Sem alteração da segurança dos usuários. |
| Financeiro | Contas, cobranças, pagamentos, faturamento, bancos, fluxo de caixa, custos e conciliação. Sem permissões de RH ou carteiras comerciais. |
| Técnico | Portal técnico, execução e conclusão das O.S., relatórios de visita, laudos e chamados próprios. Criação de O.S. somente emergencial durante o plantão cadastrado. |
| Planejamento | Triagem, criação de todos os tipos de O.S., programação, distribuição e acompanhamento operacional. Sem conclusão de O.S. ou movimentação financeira. |
| Assistente Administrativo | Consulta de colaboradores; apoio em documentação, certificações, ponto, ferramentas e lançamentos a pagar/receber. Sem pagamento, conciliação, saldos bancários, dados salariais ou gestão de acessos. |

Todos os perfis incluem o dashboard, a equipe/chat e alertas. As carteiras de geradores, peças/serviços e contratos começam bloqueadas; podem ser atribuídas individualmente na matriz quando necessário. A alçada inicial de desconto é zero.

## Ajustes individuais

- Use a matriz para definir quais telas a pessoa vê e quais ações executa em cada tela.
- **Restaurar padrão deste perfil** repõe as permissões do modelo no formulário. Salve para confirmar.
- **Permissões personalizadas** remove a identificação do modelo e mantém a configuração atual.
- Reaplicar o perfil Técnico a um técnico preserva seus plantões existentes.
- Cadastre os plantões por técnico, com início e fim. Um período pode abranger a noite, o fim de semana ou um feriado. Sem período vigente, a abertura emergencial permanece bloqueada.
- Alterar o cargo manualmente sai do modelo e usa a configuração inicial do cargo, que deve ser revisada antes de salvar.

## Implementação

Os modelos são definidos em `backend/src/modules/users/access-profiles.ts` e consultados em `GET /users/access-profiles`, sujeito às permissões de gestão de usuários. O identificador do modelo fica no JSON existente de regras de acesso. Não há migração de tabelas ou alteração automática de contas.

A autorização continua verificando as permissões reais e a matriz de telas e ações, independentemente do identificador do modelo.
