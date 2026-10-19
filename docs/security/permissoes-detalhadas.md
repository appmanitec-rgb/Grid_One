# Permissões por colaborador

## Onde configurar

RH → Colaboradores e acessos → selecione a conta → Permissões.

1. Atribua as carteiras: Geradores, Peças e serviços, Contratos. Uma gestora pode receber as três.
2. Defina a alçada individual de desconto entre 0% e 100%. Sem alçada cadastrada, o limite é 0%.
3. Escolha cada tela e marque se pode visualizar. Em seguida, escolha suas ações.
4. Autorize os tipos de tarefa que o colaborador pode criar.
5. Para técnicos, cadastre os plantões com início e fim completos, no horário de Brasília.
6. Salve as permissões.

Os controles individuais restringem as permissões compartilhadas do perfil. Conceder uma ação na tela habilita a permissão base correspondente; ocultar uma tela não desabilita os outros fluxos que compartilham essa permissão.

## Comercial

- Propostas são separadas pelo tipo; oportunidades, pela carteira comercial.
- Contratos e Renovações também exigem a carteira Contratos.
- A separação é validada na API para listagem, detalhe e gravação, além de documentos e relacionamentos da ficha do cliente.
- Responsáveis comerciais devem estar ativos e ter acesso à carteira atribuída. Administradores e gestores elegíveis também podem ser responsáveis.
- Descontos dos itens, desconto geral e redução de preço em relação ao catálogo entram na alçada. O limite monetário respeita o arredondamento em centavos. A ordem dos itens não altera o preço de referência de geradores.
- Pedidos acima da alçada seguem a solicitação de aprovação existente. O aprovador também precisa ter alçada e acesso à carteira.
- Dados da central do cliente mantêm seu escopo pelo cliente vinculado; a carteira interna do CRM não fica disponível no portal.

## Operação e plantões

- Cada colaborador recebe tipos de O.S. explícitos.
- Técnicos podem criar somente Atendimento emergencial e apenas durante um plantão vigente, mesmo se outro tipo for marcado por engano.
- A regra também se aplica à abertura de chamados pelos técnicos e à conversão de chamados em O.S.
- Início inclusivo, fim exclusivo. Um plantão pode atravessar dias: sexta-feira às 18h até segunda-feira às 8h. Feriados são cadastrados como intervalos completos.
- As ordens automáticas de propostas aprovadas e preventivas contratuais continuam seguindo seus próprios fluxos de aprovação e liberação financeira.
- A disponibilidade operacional do técnico é um cadastro separado da autorização para abertura durante o plantão.

## Segurança e compatibilidade

- Somente quem administra segurança de usuários pode alterar carteiras, alçada e plantões, criar contas internas, mudar e-mails de acesso ou reativar contas. Essa proteção também impede a desativação ou exclusão de administradores por contas delegadas.
- Administradores mantêm acesso integral. Nenhum usuário é criado na base principal por esta atualização.
- Contas sem atribuição explícita não recebem carteira comercial nem tipos de tarefa automaticamente.
- Contas sem matriz individual mantêm a política do perfil. A primeira edição registra as telas existentes; liberar uma tela depois não libera as telas vizinhas do mesmo departamento. Telas novas não são liberadas automaticamente para matrizes já configuradas.
- Seletores financeiros usam consultas de apoio sem dados bancários privados. Saldos exigem acesso à tela bancária, ao fluxo de caixa, ao extrato ou à conciliação.
- Criar ou editar não permite contornar conclusão, aprovação, cancelamento ou confirmação de pagamento pelo campo de status. Essas ações exigem a permissão específica.
- A API recarrega as regras da base em cada requisição; alterações de acesso e alçada não dependem de expirar o token.
- Para atualizar imediatamente os menus de outra sessão, renove a sessão ou entre novamente. A API já bloqueia acessos revogados.
- A migração é aditiva: uma coluna JSON para regras, desconto percentual na oportunidade e tipo de O.S. emergencial.

## Verificação

Validação em 19/10/2026: 72 testes unitários e 8 cenários de ponta a ponta aprovados. Os cenários usam uma base isolada, incluindo perfis distintos, acesso direto à API e edição no computador e no celular.

Testes unitários: regras comerciais, alçada, combinação de descontos, períodos de plantão, validação de payload e proteção de usuários/autenticação.

Testes de ponta a ponta: frontend/e2e/detailed-access-rules.spec.ts. Exigem ambiente isolado na porta 3100 e nunca devem apontar para a base principal.

## Otimização de sessão pendente

A compactação das regras dentro da sessão não integra esta publicação. A revisão automática pediu autorização específica para alterar esse formato interno; a solicitação continua pendente. Configurações com muitas telas e dezenas de plantões podem exceder o limite de tamanho do cabeçalho HTTP no formato atual. Os rascunhos de compactação permanecem separados, sem integração na autenticação.
