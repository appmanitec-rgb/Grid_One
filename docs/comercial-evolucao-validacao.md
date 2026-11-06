# Evolução comercial — implementação e validação

Início: 28/10/2026. Atualização: 29/10/2026. **Implementação e validação desta entrega concluídas no ambiente isolado. Sem liberação para produção.**

O usuário autorizou as oito melhorias comerciais e escolheu a configuração de dados sensíveis **por usuário e carteira**. Não houve commit, push, ativação em produção ou migração da base principal nesta rodada.

## O que foi entregue

| Área | Comportamento e acesso |
| --- | --- |
| Agenda comercial | Contatos pendentes e atrasados, propostas vencendo, aprovações, negociações sem avanço e continuidade das vendas. Dez registros por página; carteira e registros autorizados pela API. |
| Custos e margem | Estimativa interna com origem dos custos, despesas adicionais conferidas e cobertura das informações. Custo ausente não vira zero. Custos e margem têm liberações separadas. A estimativa não equivale a lucro contábil. |
| Oportunidades | Contato, local, vistoria, próximo retorno, propostas vinculadas e linha do tempo. Motivos de perda em português, em diálogo com foco controlado. |
| Disponibilidade | Demanda repetida somada, saldo físico menos reservado, indicação de compra ou confirmação com Planejamento. A consulta não reserva, compra, recebe nem agenda. |
| Revisões e aprovação | Comparação legível entre versões, acesso à ficha anterior e contexto de desconto solicitado. Ações de aprovação continuam dependendo de suas permissões existentes. |
| Biblioteca de modelos | Textos de e-mail, aviso, lembrete, automação e escopos de peças/serviços, por carteira. Rascunhos, versões, histórico e publicação controlada. Modelo publicado pode preencher a proposta ainda não salva e a mensagem de envio, sem envio automático. |
| Continuidade da venda | Pendências derivadas do pagamento, pedido, contrato e execução, com responsável e prazo. A atribuição não confirma a ação operacional ou financeira. |
| Indicadores gerenciais | Por carteira e período de até um ano; propostas na última revisão, oportunidades e vendas medidas separadamente, descontos e cobertura das margens. Recebíveis vinculados não são apresentados como emissão fiscal nem caixa do período. |

A biblioteca de documentos diagramados e os procedimentos técnicos continuam nos editores existentes. A importação anterior de escopos permanece acessível em **Modelos anteriores e importação**. Usar um texto não dispensa a classificação e a conferência técnica do serviço.

## Configuração por usuário e carteira

Caminho: **Administração → Usuários e permissões → Permissões → selecionar a conta → Administração responsável do Comercial**. A área compartilhada de colaboradores continua disponível pelos acessos existentes de RH.

Cada carteira — Geradores, Peças e serviços, Contratos — possui uma designação de responsável e cinco liberações: acompanhar equipe/indicadores, consultar/conferir custos, consultar margem, editar modelos e publicar modelos. A carteira precisa estar atribuída ao perfil.

- ADMIN e master não herdam automaticamente as novas liberações sensíveis.
- Um usuário interno pode ser designado responsável sem promoção para ADMIN geral.
- Flags isoladas sem a designação não concedem acesso. CLIENT não acessa a área interna.
- Apenas a administração de segurança configura as designações. A configuração possui controle de concorrência e auditoria.
- Tela, ação, carteira, propriedade do registro e alçada de desconto continuam sendo verificadas em conjunto.
- Vendedor comum vê seus registros; visão da equipe exige a liberação específica daquela carteira.
- A autenticação consulta o usuário atual no banco. Revogação surte efeito na API com a mesma sessão; claims de cargo inseridas artificialmente no token não substituem os dados do cadastro.
- A edição comum de perfil preserva as responsabilidades comerciais atuais e não permite substituí-las por um JSON enviado pelo navegador.

## Ambiente e preservação

Frontend de revisão: `http://127.0.0.1:3003`. Backend exclusivo: porta 3006. Banco: **gridone_proposals_f1_20261023**, PostgreSQL local na porta 5433. Os scripts verificam o nome do banco e o endereço antes de escrever.

Cliente Prisma e compilação separados em `backend/runtime-commercial`, `backend/dist-commercial` e `frontend/.next-commercial`. Envios externos e automações desabilitados nesse backend. Os servidores principais e o ambiente anterior nas portas 3002/3005 não foram reiniciados por esta validação.

Migrações aditivas aplicadas somente no banco isolado:

- `20261028180000_commercial_workspace`: estimativas internas, versões de textos e atribuições de acompanhamento.
- `20261028190000_commercial_scope_indexes`: índices para consultas de carteira, proprietário, etapa e agenda.

Backup das fontes e do diff anterior em `runtime-logs/comercial-20261028/`. As alterações preexistentes permanecem no workspace. HEAD de referência preservado: `268398d3fc0e161b5e204c6a00eba68f6d8b8228`.

Contas e registros usados nos testes têm prefixo **QA-COM-20261028** e existem apenas na base isolada. As comparações por hash confirmaram a preservação dos administradores originais desse banco e dos PDFs/DOCXs históricos congelados. Nenhuma designação foi atribuída aos usuários reais da base principal.

## Resultados automatizados

| Verificação | Resultado |
| --- | --- |
| Tipos do backend e frontend | Aprovados |
| Compilação de produção do frontend em diretório separado | Aprovada após os ajustes finais de regras antigas e identificação dos componentes |
| Regressão backend | **291 testes, 36 suítes, zero falhas** |
| Regras novas de Comercial | **22 testes, zero falhas** |
| Lógica frontend via runner Playwright | **43 testes, zero falhas** |
| API real com contas separadas | **14 cenários, zero falhas** |
| Lint do módulo Comercial e guardas novos | Zero erros e zero avisos |
| Lint frontend alterado | Zero erros; verificação final do editor corrigido também sem avisos |

Os 43 testes frontend são testes de lógica, sem automação da interface por esse runner. Os testes reais de navegador abaixo foram executados separadamente pelo controle de navegador com Playwright.

A execução ampla de lint do backend excedeu o limite de três minutos; não é declarada aprovada. Foram concluídos lint dos módulos novos/guardas, checagem de tipos e regressão das integrações alteradas. O teste antigo de permissões que exige um servidor próprio na porta 3100 não foi redirecionado nem declarado executado; os cenários atuais de API usam exclusivamente a porta 3006.

Os 14 cenários de API cobrem: ausência de herança por ADMIN; designação sem promoção global; proprietário e carteira em listas e URLs diretas; agenda e CRM do mesmo cliente; custo e referências comerciais em catálogo/cliente/equipamento/pedido; busca limitada a dez; demanda duplicada sem mutação de estoque; custo desconhecido versus zero; custo sem margem; estimativa canônica e conflitos; bloqueio de aprovação/financeiro; versões e tokens de modelos; atribuição pós-venda sem criar ordens/recebimentos; indicadores sem contar revisões antigas; revogação imediata; bloqueio ao portal; preservação de administradores e documentos.

## Navegador real

Resoluções efetivamente conferidas: **1366 × 900** e **390 × 844**, escala visual **1 (100%)**, temas claro e escuro. O navegador usou a origem 3003 e contas fictícias; as abas do ambiente anterior foram preservadas.

- Agenda desktop clara e mobile escura: sem rolagem horizontal da página, textos legíveis e cartões acomodados.
- Responsável: indicadores da equipe disponíveis. Vendedor: esse controle ausente; custos e margens ausentes na ficha da proposta.
- Editor: criação e publicação de um modelo fictício com variáveis públicas; sem envio de mensagem.
- Proposta: navegação pelas quatro etapas, seleção pesquisável de contas de emitentes diferentes, alerta de conferência financeira, aviso de duplicidade e bloqueio técnico mantidos.
- Conjuntos TOF/TM/TB: selecionar e desmarcar cada conjunto; retorno a zero itens selecionados. Escape fecha a seleção e devolve o foco ao botão de abertura.
- Modelo publicado: prévia com cliente, equipamento, vendedor e itens atuais; aplicação explícita; salvamento do rascunho de edição e recuperação após recarregar com o texto preservado.
- Motivo de perda: diálogo em português; foco permanece no diálogo ao usar Tab; Escape cancela sem mudar a etapa da oportunidade.
- Comparação de revisões: link da ficha anterior disponível ao proprietário; área de custos ausente para vendedor.
- Permissões: conta com regras antigas abre corretamente; troca entre usuários mantém um único editor. Conferido o responsável com todas as liberações em Peças/serviços e o usuário com custos liberados, mas equipe, margens e modelos bloqueados. Em 390 px, a página não apresentou rolagem horizontal.

Evidências visuais em `docs/evidencias/comercial-20261029/`: `agenda-desktop.png`, `agenda-mobile-escuro.png`, `conjuntos-mobile-escuro.png`, `modelo-na-proposta.png`, `proposta-vendedor-revisoes.png`, `motivo-perda.png`, `permissoes-por-carteira.png` e `permissoes-mobile.png`.

## Defeitos encontrados e corrigidos

1. A ficha do catálogo podia mostrar referências a propostas de outro vendedor. A relação agora usa o mesmo recorte de proprietário/carteira. As fichas de cliente e equipamento e a consulta de pedidos foram verificadas no teste real.
2. Contadores de propostas na pesquisa de clientes foram limitados aos registros autorizados.
3. As pesquisas de clientes e catálogo aceitavam até vinte registros quando o parâmetro era ampliado. O teto da API agora é dez; a pesquisa continua disponível.
4. O editor de permissões assumia que todas as seções do JSON existiam. O navegador encontrou falha em conta com regras parciais. A leitura completa as seções ausentes sem conceder permissões, preservando os valores existentes; há teste de regressão específico.
5. O bloco de responsabilidades e o editor de telas usavam a mesma chave entre componentes irmãos. A troca de conta podia acumular blocos antigos na interface. As chaves agora são distintas. A troca real entre responsável completo e responsável somente por custos confirmou um único bloco, com os direitos da conta atual.
6. Ajustes de interação: abortar prévias antigas ao trocar modelo, preservar assunto preenchido quando o modelo não tem assunto, evitar edição concorrente silenciosa, usar valores e datas legíveis na comparação.

## Limitações e parecer para implantação

**Parecer: apto para revisão funcional desta entrega no ambiente isolado. Produção não liberada por este relatório.** Este documento complementa os relatórios anteriores e não substitui a homologação integral da Fase 1 ou dos módulos legados.

| Criticidade | Pendência ou limite |
| --- | --- |
| Alta operacional antes da ativação | Configurar os responsáveis e carteiras dos usuários reais e revisar a atribuição dos registros antigos. Sem designação, o cargo ADMIN não concede a nova visão de equipe nem os dados sensíveis. Nenhuma configuração foi aplicada na base principal. |
| Média | Homologar com os vendedores e o Financeiro os recebíveis de empresas distintas, documentos institucionais emitidos e fluxo legado de solicitação de desconto. A rodada atual não emitiu cobrança real nem aprovou proposta histórica. A solicitação de desconto permanece solicitação; não é tratada como recálculo de documento aprovado. |
| Média | Envio externo e confirmação por provedor não foram testados, pois estão desabilitados. Acesso ao link não é apresentado como prova de leitura ou aceite. |
| Baixa | Lint amplo do backend não concluído por limite de execução; verificações focadas e tipos aprovados. |
| Baixa | A hidratação do formulário antigo ainda pode mostrar brevemente campos vazios antes de recuperar o rascunho; o conteúdo salvo foi recuperado corretamente no teste. |

A ativação exigirá aplicar as migrações na janela autorizada e realizar a conferência dos perfis reais. Não foi executado commit, push, deploy, migração principal ou publicação externa.
