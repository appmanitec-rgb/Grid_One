# Perfil e notificações — 14/10/2026

## Ajustes

- O cabeçalho consultava apenas o nome no token e sempre desenhava a inicial. Agora carrega a foto salva em /users/me, sincroniza nome e foto ao salvar e atualiza outras abas abertas. Imagens indisponíveis usam a inicial como alternativa.
- Sino ao lado do perfil, disponível também no celular, com contagens separadas de mensagens não lidas e pendências.
- Painel com prévias de mensagens, alertas e links para a conversa correta. A abertura do painel preserva o estado de leitura; a conversa aberta atualiza a contagem.
- Aviso lateral silencioso, dispensável, sem capturar o foco da digitação. Desaparece após oito segundos, pausando enquanto recebe o mouse ou foco. Mantém o resumo financeiro e os botões da proposta livres.
- Mensagens já existentes entram na contagem sem produzir uma sequência de popups ao entrar. A conversa em leitura não gera avisos duplicados.
- Consulta de mensagens a cada 12 segundos com o sistema visível, com atualização ao retornar à aba e após a leitura. Respeita os canais e participantes autorizados pela API existente.
- Conversas em abas ocultas não marcam automaticamente novas mensagens como lidas.

## Verificação

12 cenários aprovados, considerando o resultado mais recente por cenário: primeira bateria de 10 testes e bateria final de seis testes de perfil/mensagens, incluindo dois cenários novos para o resumo financeiro.

Cobertura: foto salva e removida no cabeçalho, persistência após recarregar, sincronização entre abas, mensagens entre dois usuários, privacidade de canal, foco de digitação, leitura, links entre conversas na mesma página, erro temporário e nova tentativa, alimentação do feed e cabeçalhos em 1366, 768 e 390 pixels.

Compilação isolada e TypeScript aprovados. Lint sem erros; preservado um aviso existente de navegação com recarregamento após alterar senha.

Testes executados em gridone_e2e, sem alterar fotos ou criar mensagens na base real. Resultados e capturas em runtime-logs/profile-notifications-*. Capturas representativas inspecionadas visualmente.

Alterações locais, sem commit ou envio ao GitHub.
