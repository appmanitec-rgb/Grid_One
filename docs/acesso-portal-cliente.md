# Acesso ao Portal do Cliente

O login da equipe continua na página inicial. O botão **Sou cliente** abre `/cliente/entrar`, que aceita somente contas com o cargo `CLIENT` vinculadas a um cadastro de cliente. Uma conta de cliente não entra no painel interno; contas da equipe não entram no login do cliente.

## Criar e ativar uma conta

1. Em **Gestão de usuários → Novo usuário**, escolha o cargo **Cliente**, informe o e-mail do representante e selecione o cliente vinculado. A conta é criada inativa, com senha aleatória desconhecida da equipe.
2. Em **Gestão de usuários → Controle**, selecione essa conta e clique em **Gerar link de ativação**. A ação invalida links anteriores, pausa sessões existentes e mostra um link de uso único por 48 horas.
3. Confirme o destinatário antes de compartilhar o link por um canal confiável. O cliente abre o link, cria uma senha com pelo menos 12 caracteres e entra por **Sou cliente**. O sistema não envia o link automaticamente.

O link contém um token aleatório apenas no fragmento da URL. O banco guarda somente o hash do token. Depois da ativação, o token não pode ser reutilizado. Para acesso remoto de clientes, configure HTTPS antes de compartilhar o link ou receber senhas.

Em produção, defina `NEXT_PUBLIC_PORTAL_BASE_URL` com a origem HTTPS pública do frontend, por exemplo `https://portal.suaempresa.com.br`. Sem essa variável, o link usa o endereço pelo qual o administrador abriu o sistema; `localhost` e endereços da rede interna não funcionam para clientes externos.

## Conta preparada

O usuário de portal **Cartório Mesquita** foi vinculado ao cadastro de contrato `CARTORIO MESQUITA` e ao e-mail registrado nesse cliente. A conta está inativa até que a equipe gere o link e o representante defina sua senha.

O cadastro está classificado como cliente de contrato, mas atualmente não há registro de contrato operacional vinculado a ele no banco. A página **Meus contratos** mostrará um estado vazio até que esse contrato seja cadastrado ou vinculado.

## Ações disponíveis

O portal já permite consultar equipamentos, contratos, propostas, ordens, laudos, documentos e cobranças liberadas. Propostas em análise do cliente podem ser aprovadas ou recusadas. A área **Solicitações** encaminha pedidos de peças e serviços ao comercial; ela não é um checkout com pagamento imediato.
