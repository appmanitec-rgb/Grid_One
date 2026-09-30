# Comunicação interna

A página **Equipe · Feed e chat** fica em `/dashboard/team` e é destinada aos usuários internos ativos. Contas com perfil `CLIENT` não podem acessar as APIs de comunicação, mesmo por URL direta.

## Feed

- Publicações de até 5.000 caracteres, com comentários e reações.
- O autor pode editar ou remover sua publicação. Gestores e administradores podem remover conteúdo e fixar avisos.
- Comentários de até 1.000 caracteres podem ser removidos pelo autor ou por quem pode moderar.
- O conteúdo é paginado. Ao excluir um usuário, o nome exibido nas publicações e comentários é preservado.

## Canais

- Canais iniciais: **Geral**, **Comercial**, **Operação** e **Suprimentos**. Gestores e administradores podem criar outros canais.
- Todos os usuários internos podem ler e escrever em todos os canais. Os canais não são privados por departamento.
- Mensagens de até 2.000 caracteres podem ser editadas ou removidas pelo autor. Gestores e administradores também podem removê-las.
- A página consulta novas mensagens a cada 5 segundos e a lista de canais a cada 15 segundos. A leitura é registrada quando o canal está aberto e o usuário está próximo do fim da conversa.
- Mensagens antigas são carregadas em páginas. O nome do autor permanece visível caso o cadastro dele seja excluído.

## Implantação e verificação

As migrations `20260928210000_team_communication` e `20260928213000_team_author_snapshot` criam as tabelas e preservam a autoria histórica. Após aplicar as migrations, gere o cliente Prisma e compile o backend e o frontend.

O teste `backend/scripts/team-smoke.cjs` usa exclusivamente a API na porta 3002 e um banco cujo nome começa com `gridone_pilot_`. Ele cobre publicação, comentários, reações, paginação, mensagens, leitura, moderação, isolamento de clientes e exclusão de usuário.
