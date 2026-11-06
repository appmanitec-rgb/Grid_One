# Gerador de escopos técnicos

## Refinamento de 26/10/2026 — Fase 1 isolada

Na instância de validação da Fase 1, a etapa **Serviços** permite classificar a finalidade/execução por serviço, selecionar procedimentos existentes ou informar descrição manual suficiente e gerar/conferir a prévia. A seleção substitui o vínculo e o pacote daquele serviço somente na proposta; **Usar vínculo do catálogo** desfaz essa substituição. Alterações nos fatos exigem nova confirmação/conferência. A Revisão mantém o gerador existente, e rascunhos incompletos continuam permitidos.

Serviço sem finalidade impede liberação, sem produzir texto automático genérico para o cliente. Fornecimento isolado não exige substituição. A biblioteca já cadastrada e os documentos históricos não são reescritos; procedimentos antigos precisam de conferência do responsável técnico.

Consulte o [relatório do refinamento](escopos-refinamento-validacao.md) e o [roteiro de validação](escopos-refinamento-roteiro.md). **Implantação ainda reprovada:** navegador indisponível e conferências operacionais pendentes. A seção abaixo documenta o fluxo e os resultados da entrega anterior, não uma ativação deste refinamento no principal.

## Uso no sistema

1. Abra **Peças e serviços → Biblioteca técnica** ou a aba técnica da ficha de um item do catálogo.
2. A biblioteca inicial contém famílias e procedimentos editáveis para materiais, inspeções, intervenções e testes. A instalação é idempotente: preserva os cadastros já existentes.
3. Associe cada produto à sua família de material e cada serviço à família correspondente. Os vínculos usam o ID real do catálogo; o nome comercial não determina o trabalho contratado.
4. Para um pacote, informe os **procedimentos incluídos** no serviço comercial. A venda isolada de um material não inclui mão de obra.
5. Na proposta de peças e serviços, vá à etapa **Revisão → Gerar escopo técnico**. Confira as seções, origens dos procedimentos e pendências; edite a prévia e aplique-a. A revisão fica gravada ao salvar a proposta.
6. A ficha da proposta exibe o texto, as condições e o histórico técnico. Alterações de itens, quantidades ou equipamento sinalizam a necessidade de nova conferência.
7. A O.S. gerada da proposta aprovada recebe uma cópia da versão contratada. Registre autorizações ou recusas no painel **Escopo aprovado e condições de execução**. Esse registro não altera os itens vendidos.

Os procedimentos iniciais precisam ser conferidos pelo responsável técnico da empresa. Os vínculos comerciais devem ser cadastrados explicitamente; itens sem vínculo permanecem no escopo com alerta de classificação, sem prometer intervenções por aproximação de nome.

### Configuração inicial aplicada localmente

- **30 famílias e 30 procedimentos** instalados nas novas tabelas técnicas.
- **15 vínculos explícitos**: os 10 materiais conferidos do equipamento `391EQP`, quatro cadastros de manutenção preventiva de grupo gerador e um de manutenção corretiva de grupo gerador.
- Materiais: SKUs `1492OOO`/`4832OOO` → componente; `4327OOO` → fluido de arrefecimento; `2939OOO` → bateria; `1248OOO` → filtro de óleo; `1245OOO` → filtro de ar; `1247OOO` → filtro de combustível; `3109OOO`/`2169OOO` → mangueira; `2639OOO` → óleo.
- Serviços: SKUs `1733SOO`, `3988SOO`, `3987SOO`, `3989SOO` → manutenção preventiva; `3329SOO` → manutenção corretiva.
- Essa classificação foi gravada por ID, por meio da API autenticada e auditada. Não há reconhecimento automático pelo texto ao gerar uma proposta. Nenhum vínculo anterior foi substituído, nenhum pacote foi presumido e nenhum teste foi incluído nesses serviços de manutenção.
- Demais produtos e serviços devem receber seus vínculos na Biblioteca técnica. O nome de um material, inclusive “bateria com troca”, não é suficiente para contratar mão de obra no motor.

## Requisitos e arquitetura

- Motor deterministico no servidor: resolve somente catalogo ativo e vinculos tecnicos explicitos; nao cria produtos nem deduz procedimentos pelo nome.
- Biblioteca: familias de material/servico, procedimentos versionados e perfis tecnicos por item do catalogo. Cadastros exigem permissao de alteracao do catalogo e ator interno.
- Preview autenticado e sem gravacao: recebe os itens atuais, inclusive nao salvos, valida carteira, cliente e equipamento e retorna snapshot sem custos/precos.
- Snapshot associado a proposta: texto, insumos e definicoes usados, hashes de origem/biblioteca, revisao humana e ajustes manuais. Revisoes comerciais preservam o snapshot anterior.
- Persistencia dentro da transacao da proposta: registro de versoes tecnicas somente quando o conteudo mudar, com autor e auditoria. Nova biblioteca nunca altera historico aprovado.
- Mudanca de itens/equipamento invalida a revisao anterior; texto e definicoes antigos permanecem disponiveis ate nova conferencia. Alteracao manual de texto fica registrada separadamente.
- Condicoes operacionais nunca significam autorizacao: permanecem PENDING no snapshot. Estoque, financeiro, permissoes e liberacao operacional continuam nos fluxos existentes.
- Migracao apenas aditiva: novas tabelas e coluna JSON opcional; sem seed automatico ou alteracao de registros existentes. Defaults somente por acao explicita e idempotente.

## Contratos de integracao

- TechnicalScopesService.preview(dto, actorUserId): validacao e preview do formulario atual.
- persistProposalTechnicalScope(tx, input): versao canonica calculada no servidor, com itens reais e contexto da proposta; retorna o snapshot a persistir na proposta.
- `GET /catalogs/technical-scope/library`: famílias, procedimentos e vínculos, sem preços ou custos.
- `POST /catalogs/technical-scope/seed`: instalação explícita e idempotente da biblioteca inicial.
- `PUT /catalogs/technical-scope/families/:code`, `/procedures/:code`, `/profiles/:catalogItemId`: manutenção auditada e versionada.
- `POST /proposals/technical-scope/preview`: prévia sem gravação.
- `GET /proposals/:id/technical-scope/history`: versões técnicas internas, respeitando tela e carteira.
- Criar/editar proposta aceita `technicalScopeReview: { sourceHash, libraryHash, reviewed }`. O servidor recalcula as regras e grava o snapshot; não aceita definições técnicas do navegador como autoridade.
- `PATCH /maintenance-orders/:id/technical-authorizations`: registro operacional auditado por condição. Exige permissão de atualização da O.S., vínculo do técnico quando aplicável, responsável para autorizar e motivo para recusar. Modalidades de carga não contratadas são rejeitadas.

## Segurança dos registros

- O snapshot guarda os itens e as definições usados, suas versões, hashes, origem das atividades, texto aplicado e responsável pela conferência.
- Repetir uma conferência sem mudanças não cria outra versão.
- Regenerar conserva o texto atual enquanto a prévia está aberta. Se o bloco original ainda estiver íntegro, ele pode ser substituído preservando textos antes/depois; conflitos exigem escolha explícita de substituição ou acréscimo.
- Propostas aprovadas continuam imutáveis pelo fluxo existente. Uma revisão comercial herda o snapshot anterior; novas conferências pertencem à nova proposta.
- As condições congeladas são incluídas nos documentos mesmo se o texto livre tiver sido editado. Nenhum documento concede autorização operacional.
- Editar o checklist genérico não pode forjar ou apagar o snapshot da venda nem os registros de autorização. O registro de execução é separado e auditado.
- Não há dependência de IA, API externa ou custo recorrente para compor o escopo.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Motor e biblioteca inicial | `backend/src/modules/technical-scopes/technical-scope.engine.ts`, `.defaults.ts`, `.types.ts` |
| Persistência, acesso e configuração | `technical-scopes.service.ts`, `technical-scope-resolution.ts`, `technical-scope-integration.ts`, DTOs e controller no mesmo módulo |
| Banco | `backend/prisma/schema.prisma`, migração `20261022173000_proposal_technical_scopes` |
| Proposta | `proposals.service.ts`, `proposals.controller.ts`, DTO de criação e módulo |
| Prévia e histórico | `frontend/app/dashboard/proposals/TechnicalScopeGenerator.tsx`, `TechnicalScopeRecord.tsx`, formulário `new/page.tsx`, ficha `[id]/page.tsx` |
| Configuração pela interface | `frontend/app/dashboard/catalog/technical-library/page.tsx`, `TechnicalScopeCatalogPanel.tsx`, `frontend/lib/technical-scopes.ts` |
| Documentos | `documents.service.ts` e página de impressão da proposta; preservados os modelos existentes |
| Execução | `technical-scope-execution.ts`, `proposal-work-order.ts`, serviço/controller/DTO de O.S., `frontend/app/dashboard/orders/OrderTechnicalScope.tsx` |
| Seleção de conjuntos | `new/equipment-item-sets.ts`, `EquipmentItemsPicker.tsx`: segundo clique desmarca o conjunto e preserva seleção fora dele |

## Verificacao

- **43 testes de backend aprovados:** 21 cenários do motor, 8 de condições/execução e 14 de regressão de pagamentos e liberação financeira.
- **18 testes de funções da interface aprovados:** seleção/desmarcação de TOF/TM/TB, deduplicação e identificação de escopo desatualizado. Esses testes não usam navegador e não representam uma inspeção visual.
- **10 verificações de persistência aprovadas**, com o serviço real de propostas e banco PostgreSQL separado: biblioteca/vínculos, prévia sem efeitos, salvamento, histórico, edição manual, obsolescência, restrições de acesso, cópia para O.S. e recusa operacional.
- Migração testada em cópia restaurada do banco antes de aplicada localmente. Após aplicação local, **13 tabelas operacionais mantiveram contagens e hashes idênticos**; três administradores ativos preservados.
- Backup anterior à migração: `backend/backups/20261023-121235_gridone_db_672585e1.dump`, acompanhado de manifesto SHA-256 e verificação por `pg_restore --list`.
- Evidências locais, sem dados de login: `runtime-logs/technical-scopes-prp/`. O banco de teste se chama `gridone_scope_prp_20261023`; os registros de teste ficam exclusivamente nessa cópia.
- **Builds de produção da API e interface aprovados**, checagem de tipos aprovada e lint dos novos módulos/componentes sem erros.
- **Verificação HTTP na instância local aprovada:** saúde da API, proxy da interface, autenticação obrigatória, biblioteca, instalação repetida, prévia com itens reais, histórico e rota da interface. Instância em `http://localhost:3001`.
- Após os vínculos iniciais, a prévia com os 10 materiais sem serviço gerou **zero intervenções**; os mesmos materiais com manutenção preventiva contratada geraram **9 procedimentos**, preservando 11 linhas comerciais e sem acrescentar testes. Hash de todos os registros do catálogo permaneceu idêntico.

### Comandos de testes

No backend: `npx jest --runInBand technical-scope proposal-financial-release proposal-payment-plan`.

No frontend, com `E2E_SKIP_WEBSERVER=1`: `npx playwright test equipment-item-sets.spec.ts technical-scope-source.spec.ts --reporter=list`. As suítes exercitam funções puras e não abrem o navegador.

### Limites da validação

A conexão com o navegador não respondeu nesta sessão. A conferência visual da prévia, da biblioteca e dos documentos continua necessária na validação do usuário. Regras específicas de fabricante, capacidades, tensões e percentuais de carga não são inventados: dependem dos dados do equipamento e das regras técnicas cadastradas.
