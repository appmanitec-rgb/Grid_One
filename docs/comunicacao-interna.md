# Comunicação interna

A página **Equipe · Feed e chat** fica em `/dashboard/team` e é destinada aos usuários internos ativos. Contas com perfil `CLIENT` não podem acessar as APIs de comunicação, mesmo por URL direta.

## Feed

- Abas **Geral**, **Comercial**, **Obras** e **Serviços**. Cada publicação manual pertence à aba selecionada.
- Ao aprovar uma proposta como ganha, o feed Comercial anuncia cliente, vendedor e tipo da venda (contrato, gerador ou outra proposta), sem valores. A automação cobre aprovação interna, portal do cliente e link de assinatura.
- Ao concluir uma OS de instalação, o feed Obras parabeniza a equipe e lista o técnico responsável e os participantes com sessão de trabalho registrada. Outras OS concluídas geram aviso no feed Serviços com a tarefa, o cliente e os técnicos.
- Cada aviso automático tem uma chave única por proposta ou OS e é gravado na mesma transação da conclusão para evitar publicações duplicadas ou sem conclusão.
- Publicações de até 5.000 caracteres, com comentários e reações.
- O autor pode editar ou remover sua publicação. Gestores e administradores podem remover conteúdo e fixar avisos.
- Comentários de até 1.000 caracteres podem ser removidos pelo autor ou por quem pode moderar.
- O conteúdo é paginado. Ao excluir um usuário, o nome exibido nas publicações e comentários é preservado.

## Canais

- Qualquer colaborador interno pode abrir uma conversa privada com outro colaborador. Uma mesma dupla reutiliza a conversa existente.
- Qualquer colaborador interno pode criar um canal privado selecionando participantes; o criador é incluído automaticamente. Gestores e administradores também podem criar canais públicos sem participantes selecionados.
- Canais privados aparecem somente para seus participantes. A API verifica a participação ao listar, ler, enviar, editar, excluir mensagens e registrar leitura.
- Canais iniciais: **Geral**, **Comercial**, **Operação** e **Suprimentos**. Todos os usuários internos podem ler e escrever nos canais públicos.
- Mensagens de até 2.000 caracteres podem ser editadas ou removidas pelo autor. Gestores e administradores também podem removê-las.
- A página consulta novas mensagens a cada 5 segundos e a lista de canais a cada 15 segundos. A leitura é registrada quando o canal está aberto e o usuário está próximo do fim da conversa.
- Mensagens antigas são carregadas em páginas. O nome do autor permanece visível caso o cadastro dele seja excluído.

## Implantação e verificação

Aplicar também a migration `20261007180000_team_feeds_private_channels` e gerar novamente o cliente Prisma antes de iniciar a API.
As migrations `20260928210000_team_communication` e `20260928213000_team_author_snapshot` criam as tabelas e preservam a autoria histórica. Após aplicar as migrations, gere o cliente Prisma e compile o backend e o frontend.

O teste `backend/scripts/team-smoke.cjs` usa exclusivamente a API na porta 3002 e um banco cujo nome começa com `gridone_pilot_`. Ele cobre publicação, comentários, reações, paginação, mensagens, leitura, moderação, isolamento de clientes e exclusão de usuário.
