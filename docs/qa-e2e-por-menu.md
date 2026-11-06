# QA de ponta a ponta por menu

## Ambiente isolado

Os testes de criação usam o banco `gridone_e2e`, API na porta 3100 e frontend na porta 3101. O banco operacional `gridone_db` e os serviços nas portas 3000/3001 não são usados pelos testes.

```powershell
.\scripts\prepare-e2e.ps1
.\scripts\start-e2e.ps1
.\scripts\test-e2e.ps1
.\scripts\stop-e2e.ps1
```

O preparo usa `prisma db push` porque o histórico de migrations ainda não cria um banco vazio: `20260309155103_finance_hr_core` tenta alterar `service_contracts` antes de a tabela existir. `backend/scripts/prepare-e2e-schema.js` restaura no banco de teste os defaults de código de usuário, cliente e equipamento que existem no banco operacional, mas não são gerados pelo `db push`.

## Etapas de cobertura

| Etapa | Escopo | Verificação |
| --- | --- | --- |
| 1 | Todos os menus internos e do portal | `menu-routes.spec.ts` extrai as rotas dos componentes de navegação e verifica abertura, redirecionamento e erros do servidor. |
| 1 | Empresa, conta PIX, cliente, equipamento, oportunidade e proposta | `payment-profile.spec.ts`, `opportunity-create.spec.ts` e `proposal-operational.spec.ts` criam registros pela tela e conferem a API. |
| 2 | Contrato, chamado, OS, técnico, laudo, documentos, financeiro, estoque, compras e comunicação | Testes funcionais executados em 08/10/2026; conferir resultados e limites abaixo. |
| 3 | Cadastros e ações dos demais menus, incluindo configurações e Studio | Acrescentar testes de criação, edição e permissões para cada recurso após a navegação. |

O resultado de navegação mostra apenas que o menu abre e carrega sem erro. A criação e as regras de negócio são verificadas por testes próprios de cada fluxo.

## Execução de 07/10/2026

- Etapa 1: 61 rotas ativas de menus internos e do portal abriram sem erro do servidor; o redirecionamento da rota antiga `/dashboard/client-portal` passou em teste separado. O teste extrai as rotas dos componentes de navegação e verifica a URL final.
- Cadastro pela tela: oportunidade, cliente, equipamento, proposta, modelo de gerador e conta PIX ativa com CNPJ do favorecido. O caso PIX confere que a chave é o CNPJ do emitente e que o código de QR não é exigido.
- Etapa 2: 53 testes funcionais passaram nos arquivos `auth`, `client-portal`, `smoke-navigation`, `customer-ticket-to-order`, `commercial-contract-finance`, `finance-operational`, `service-reports`, `technician`, `public-links`, `smart-navigation`, `ux-operational`, `pilot-operational-smoke`, `payment-profile`, `opportunity-create`, `proposal-operational`, `generator-models` e `team-communication`.
- A comunicação foi verificada pela tela: publicações nos feeds comercial, obras e serviços; canal privado com participante selecionado; conversa direta; bloqueio de leitura para quem ficou fora do canal. As automações de avisos e regras de `team`, `studio`, `customer-portal` e `deliveries` passaram em 27 testes de unidade.
- `npm run build` passou no backend e no frontend. A aplicação local foi reiniciada; `/health` na porta 3000 e `/dashboard/team` na porta 3001 responderam 200.
- `prisma migrate status` confirmou as 101 migrations aplicadas no banco operacional. As duas empresas emitentes do cadastro operacional têm os CNPJs informados: MANITEC ENERGIA EQUIPAMENTOS LTDA e MANITEC SERVICES GERADORES LTDA.

### Próxima etapa funcional

Criar casos de cadastro e alteração específicos para os menus que hoje têm apenas teste de abertura ou participação indireta em outro fluxo: documentos e envios, alertas e automação, vistorias comerciais, renovações, despacho, monitoramento, garantias, locais, pedidos de venda, compras e fornecedores, cobrança e notas fiscais, cadastros de RH e frota, gestão de usuários, configurações da empresa e recursos do Studio. Priorizar dependências entre cadastros como CNPJ, empresa emitente, centro de custo e conta bancária.

O histórico de migrations ainda não cria um banco vazio sem `prisma db push`. A correção da cadeia de migrations permanece separada da cobertura funcional, pois envolve as bases já existentes. Os testes usam somente `gridone_e2e`.

## Execução de 08/10/2026

- Navegação: 62/62 rotas de menus internos e do portal passaram no banco isolado `gridone_e2e` com um trabalhador para evitar sobrecarga do PostgreSQL local.
- Fluxos funcionais: 43/44 passaram na execução ampla; o caso restante (`ux-operational`, edição de localização de estoque) passou em reexecução isolada após o teste passar a aguardar a confirmação da gravação antes de navegar. Assim, todos os 44 cenários foram verificados, embora não na mesma execução.
- Biblioteca de escopos: teste novo importou TXT pela interface, pesquisou, adicionou o texto à proposta e confirmou persistência após recarregar. PDF comercial, documento operacional e ações de proposta em rascunho também passaram pela interface.
- Sessão: renovação em duas abas, falha temporária de renovação e retorno à página após expiração passaram. Foi corrigido o acesso por URL direta que permitia ao cliente visualizar uma página interna vazia; o cliente agora é redirecionado ao portal. Teste focado passou.
- Base operacional: exemplo identificado como teste, com cliente, gerador e itens de catálogo já cadastrados. Oportunidade `5ddaf690-43b3-4ca3-b751-2d8e389042c4`, proposta `829b0c77-807c-46b4-bdd4-00c5836d28fa` (20001/00, rascunho) e modelo TXT `1bc3c649-9047-471c-9908-8af1f22293af`. A proposta usa a peça `851OOO` (filtro combustível), o serviço `3987SOO` (manutenção preventiva) e as duas contas PIX ativas. Os usuários temporários de QA foram desativados; oportunidade e proposta foram atribuídas a um vendedor ativo. Não houve envio ao cliente.
- PDFs no ambiente operacional: o download da proposta e do documento operacional retornaram `application/pdf` e assinatura `%PDF`. A limpeza de arquivos temporários do LibreOffice em timeout no Windows foi corrigida para preservar o erro de conversão e permitir o PDF alternativo.
- Publicação local: backend compilado e reiniciado; frontend compilado e reiniciado. `/health` na porta 3000 e `/dashboard/team` na porta 3001 responderam HTTP 200 após a publicação.

### Limite da revisão atual

A abertura das 62 rotas foi verificada, mas não equivale a testar todas as ações de cada menu. Os 44 fluxos funcionais cobrem os módulos comerciais e operacionais principais, finanças, comunicação, permissões e portal. Permanecem os cadastros e alterações específicas enumerados em “Próxima etapa funcional”, além da correção da cadeia de migrations para bancos vazios. Não se deve considerar esses módulos integralmente homologados apenas pelo teste de navegação.
