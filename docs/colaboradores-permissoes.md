# Colaboradores e permissões

## Navegação

A área **Colaboradores e acessos** fica em **Recursos Humanos**. O menu superior usa o mesmo departamento. A lista permite buscar por pessoa ou departamento e filtrar por departamento, perfil, situação, perfil técnico e portal. Listas de seleção maiores que dez opções usam o campo pesquisável compartilhado.

Quem já possui acesso à administração de usuários pode abrir o cadastro ou as permissões da pessoa diretamente pela linha da tabela. Os links preservam o usuário selecionado. RH sem acesso à segurança continua com documentação e cadastro de pessoas conforme as permissões existentes.

## Editor de acesso

O editor agrupa as áreas em Geral, Comercial, Operação, Ativos, Suprimentos, Financeiro, Recursos Humanos e Administração.

Cada aba apresenta:

1. **Visualização:** acesso ao módulo e a relação de telas abrangidas.
2. **Ações:** o que a pessoa pode executar no módulo.

A visibilidade do menu e as ações continuam sendo regras independentes. Ações de consulta podem ser necessárias em fluxos vinculados. Cada mudança exige salvar a conta. Trocar a conta com alterações pendentes solicita o descarte.

Os botões de padrão usam os perfis existentes do sistema. Nenhuma autorização de conta real é alterada automaticamente por esta reorganização visual. Master e edição de segurança mantêm as proteções existentes na API.

## Departamentos e perfis existentes

| Departamento | Perfil |
| --- | --- |
| Administração | Administrador |
| Gestão | Gestor |
| Comercial | Comercial |
| Engenharia | Engenharia de aplicação |
| Operação | Operação e logística |
| Campo técnico | Técnico de campo |
| Suprimentos | Suprimentos |
| Financeiro | Financeiro |
| Recursos Humanos | Recursos Humanos |
| Auditoria | Auditoria |
| Portal do cliente | Cliente do portal |
| Geral | Usuário |

O departamento textual do cadastro e o perfil de acesso são informações distintas. O texto do departamento não concede permissões. Os padrões dos doze perfis foram comparados entre API e interface.

## Troca de perfil

Quando o perfil de uma conta é trocado pela API sem uma política explícita, o sistema aplica o padrão existente do novo perfil. Isso evita manter acessos do cargo anterior, inclusive permissões de segurança.

A troca de perfil continua exigindo autorização para administrar a segurança de usuários. Permissões explícitas revisadas por um administrador são respeitadas. Salvar o mesmo perfil preserva os acessos personalizados. A regra não altera contas existentes em lote nem usa o texto do departamento para conceder acesso.

## Verificação

- Testes existentes de usuários, políticas e guardas de autorização.
- Fluxo no banco isolado de testes: RH → cadastro da pessoa → permissões.
- Gravação e reabertura de uma alteração de permissão, mantendo Financeiro bloqueado.
- Conta sem segurança não consegue editar permissões na interface nem pela API.
- RH no celular não recebe atalhos de administração de segurança.
