# Ciclo 20A - Auditoria UX Operacional

Base auditada: `f78ac47 feat: ciclo 19 motor de templates pdf profissionais`  
Tag esperada: `v0.19-pdf-templates`  
Escopo: auditoria somente. Nenhuma alteracao funcional, migration, regra de negocio, PDF, financeiro ou staging foi implementada neste ciclo.

## 1. Resumo executivo

O ERP ja tem uma base funcional forte, mas a UX operacional ainda tem pontos que tornam o uso diario mais lento e arriscado: campos sensiveis aparecem em telas amplas, alguns modulos estao visualmente ricos mas sem acoes de edicao, e os links entre entidades criticas ainda sao irregulares.

O achado mais sensivel e `Pessoas/Agentes`: o endpoint `GET /hr-admin/agents` e protegido apenas por `people.view`, mas retorna `hourCost` de usuarios internos, e a tela renderiza a coluna `Custo HH`. Em contraste, `Meu Perfil` esta bem protegido no backend: `getMyProfile()` nao retorna custo HH nem alcada de desconto, e `updateMyProfile()` remove campos administrativos do payload.

Equipamentos evoluiu bastante no detalhe: ha relacoes com cliente, contratos, OS, tickets, laudos e itens base. Ainda assim, a lista e pobre, o status aparece simplificado, nao ha tela de edicao operacional clara, e os campos especificos de grupo gerador ainda nao estao no nivel necessario para manutencao real.

Estoque tem boa protecao backend para ajuste/reserva, mas a tela de resumo nao oferece detalhe operacional do item, nao mostra trilha de movimentos/OS/compras/fornecedores e exibe acao de ajuste mesmo quando o usuario pode nao ter permissao frontend para ajustar.

Responsividade e zoom nao estao suficientemente evidenciados para as telas alvo deste ciclo. A suite visual existente cobre desktop/mobile em alguns fluxos, mas nao cobre Perfil, Agentes, Equipamentos, Estoque, zoom 110/125/150, sidebar colapsada e tabelas largas dessas telas.

Recomendacao objetiva: iniciar o Ciclo 20B por seguranca e clareza operacional: ocultar/remover custo HH e alcadas do perfil comum e de listas amplas; separar melhor Agentes/Colaboradores/Clientes/Contatos; depois enriquecer Equipamentos, Links inteligentes, Estoque com detalhe e Responsividade.

## 2. Telas e arquivos auditados

| Area | Arquivos/rotas evidenciados | Status UX |
|---|---|---|
| Meu Perfil | `frontend/app/dashboard/profile/page.tsx`, `backend/src/modules/users/users.service.ts` (`getMyProfile`, `updateMyProfile`) | Parcialmente adequado |
| Pessoas / Agentes | `frontend/app/dashboard/hr/collaborators/page.tsx`, `backend/src/modules/hr-admin/hr-admin.controller.ts`, `backend/src/modules/hr-admin/hr-admin.service.ts` | Fragil por campo sensivel e RBAC amplo |
| Equipamentos | `frontend/app/dashboard/equipments/page.tsx`, `frontend/app/dashboard/equipments/new/page.tsx`, `frontend/app/dashboard/equipments/[id]/page.tsx`, `backend/src/modules/generators/*`, `backend/prisma/schema.prisma` | Bom detalhe, lista/edicao incompletas |
| Estoque / Catalogo | `frontend/app/dashboard/inventory/page.tsx`, `frontend/app/dashboard/catalog/[id]/page.tsx`, `frontend/app/dashboard/catalog/page.tsx`, `backend/src/modules/inventory/*`, `backend/src/modules/catalogs/*` | Parcial |
| Links cruzados | `frontend/app/dashboard/orders/[id]/page.tsx`, `frontend/app/dashboard/proposals/[id]/page.tsx`, `frontend/app/dashboard/contracts/[id]/page.tsx`, `frontend/app/dashboard/clients/[id]/page.tsx`, `frontend/app/dashboard/equipments/[id]/page.tsx` | Irregular |
| Shell/responsividade | `frontend/app/dashboard/layout.tsx`, `frontend/app/dashboard/components/SidebarNavigation.tsx`, `frontend/app/dashboard/components/TopBar.tsx`, `frontend/e2e/screenshots.spec.ts` | Nao evidenciado em zoom |

## 3. Problemas encontrados

### UX20A-01 - Custo HH exposto em Pessoas/Agentes

- Prioridade: Critico
- Categoria: RBAC / dados sensiveis
- Problema: usuarios com `people.view` conseguem receber e visualizar `hourCost` na tela de Agentes.
- Evidencia encontrada:
  - `backend/src/modules/hr-admin/hr-admin.controller.ts`: `GET /hr-admin/agents` usa `@RequireAccessPolicy('people.view')`.
  - `backend/src/modules/hr-admin/hr-admin.service.ts`: `listAgentsOverview()` seleciona `hourCost` em `internalUsers`.
  - `frontend/app/dashboard/hr/collaborators/page.tsx`: `InternalUser` possui `hourCost`; `InternalTable rows={internalUsers} showHourCost` renderiza a coluna `Custo HH`.
- Impacto: exposicao de custo interno para usuarios que precisam apenas consultar pessoas/agentes. Isso cria risco trabalhista, comercial e de governanca.
- Recomendacao: criar permissao granular como `people.viewCompensation` ou `people.viewSensitiveCosts`; mascarar `hourCost` no service por padrao; renderizar a coluna apenas com permissao explicita.
- Esforco estimado: Medio
- Status: Confirmado

### UX20A-02 - Separacao de Pessoas/Agentes existe visualmente, mas ainda e conceitualmente misturada

- Prioridade: Alto
- Categoria: arquitetura UX / RBAC
- Problema: a tela ja usa abas para internos, usuarios, clientes e auditores, mas tudo vem de `GET /hr-admin/agents` e o dominio ainda mistura "usuario do sistema", "colaborador", "cliente portal" e "auditor" dentro do modulo de RH.
- Evidencia encontrada:
  - `frontend/app/dashboard/hr/collaborators/page.tsx`: titulo "Agentes" e abas `internal`, `users`, `clients`, `auditors`.
  - `backend/src/modules/hr-admin/hr-admin.service.ts`: `listAgentsOverview()` monta `internalUsers`, `portalUsers`, `clients`, `auditors` e `systemUsers`.
- Impacto: o operador pode confundir cliente com usuario/colaborador; RBAC fica dificil de explicar; campos administrativos podem aparecer fora do contexto correto.
- Recomendacao: separar conceitos na UI: `Agentes` como visao consolidada, `Colaboradores` para vinculo interno, `Usuarios` para acesso/RBAC, `Clientes` para cadastro comercial e `Contatos` para pessoas do cliente. O backend pode continuar reaproveitado, mas a resposta deve ser segmentada e mascarada por permissao.
- Esforco estimado: Medio/Alto
- Status: Confirmado

### UX20A-03 - Meu Perfil esta seguro, mas incompleto como experiencia de conta

- Prioridade: Medio
- Categoria: UX / seguranca de conta
- Problema: a tela de perfil permite edicao basica e senha, mas ainda nao organiza claramente seguranca da conta, MFA, sessoes, disponibilidade e desempenho.
- Evidencia encontrada:
  - `frontend/app/dashboard/profile/page.tsx`: formulario edita `name`, `email`, `department`, `branch`, `profilePhotoUrl` e `password`.
  - `backend/src/modules/users/users.service.ts`: `getMyProfile()` retorna apenas dados pessoais/conta; `updateMyProfile()` remove `role`, `isActive`, `accessPolicy`, `approvalDiscountLimit`, `hourCost`, `functionalId`, `documentId`, `salesTargetMonthly`, entre outros.
  - `frontend/app/dashboard/profile/page.tsx`: cards de "Meu Desempenho" aparecem como dados insuficientes.
- Impacto: a base de seguranca esta boa, mas a tela ainda parece administrativa e nao uma area de conta profissional.
- Recomendacao: dividir em blocos: dados pessoais, seguranca, disponibilidade e desempenho. Manter custo HH/alcada sempre fora do perfil comum.
- Esforco estimado: Baixo/Medio
- Status: Parcial

### UX20A-04 - Equipamentos tem detalhe rico, mas lista pobre e edicao operacional fraca

- Prioridade: Alto
- Categoria: UX operacional / cadastros mestres
- Problema: a lista de equipamentos nao mostra informacoes suficientes para operacao e a edicao de equipamento existente nao esta evidenciada na UI.
- Evidencia encontrada:
  - `frontend/app/dashboard/equipments/page.tsx`: tabela simples com equipamento/modelo, serie, cliente e status visual fixo `ATIVO`.
  - `frontend/app/dashboard/equipments/new/page.tsx`: formulario completo para criacao.
  - `frontend/app/dashboard/equipments/[id]/page.tsx`: detalhe traz cliente, contratos, OS, tickets, laudos e itens base, mas nao ha acao clara de editar o cadastro.
  - `backend/src/modules/generators/generators.service.ts`: `update()` existe no backend.
- Impacto: usuarios conseguem consultar contexto, mas a manutencao do cadastro fica lenta ou escondida. A lista nao ajuda a priorizar manutencao, criticidade, contrato ou status real.
- Recomendacao: criar/ligar tela de edicao do equipamento; ajustar lista para usar `operationalStatus`, `lifecycleStatus`, contrato, criticidade, cliente, local e ultima OS.
- Esforco estimado: Medio
- Status: Confirmado

### UX20A-05 - Permissao de Equipamentos ainda e ampla no backend

- Prioridade: Alto
- Categoria: RBAC
- Problema: endpoints de equipamentos usam permissao de pagina, sem granularidade por acao.
- Evidencia encontrada:
  - `backend/src/modules/generators/generators.controller.ts`: controller usa `@RequireAccessPolicy('pages.equipments')`.
  - Endpoints `POST`, `PATCH`, `DELETE`, modelos e itens base ficam sob a mesma permissao ampla.
- Impacto: quem pode acessar a pagina pode potencialmente criar, editar ou excluir equipamentos, dependendo do guard atual. Isso e fraco para cadastro mestre.
- Recomendacao: adotar `equipments.view`, `equipments.create`, `equipments.update`, `equipments.delete`, `equipments.manageModels` e `equipments.manageBaseItems`.
- Esforco estimado: Medio
- Status: Confirmado

### UX20A-06 - Cadastro de grupo gerador ainda nao cobre dados tecnicos suficientes por ativo

- Prioridade: Alto
- Categoria: modelagem / UX tecnica
- Problema: existem campos basicos do gerador, mas faltam dados tecnicos por equipamento que sao importantes para manutencao de grupos geradores.
- Evidencia encontrada:
  - `backend/prisma/schema.prisma`: `Generator` possui `brand`, `power`, `serialNumber`, `hourMeter`, `condition`, `operationalStatus`, `lifecycleStatus`, `criticality`, datas e vinculos.
  - `backend/prisma/schema.prisma`: `GeneratorModel` possui alguns defaults como `defaultVoltage`, `engineModel`, `alternatorModel`, `controllerType`, `defaultTankCapacity`, mas isso fica no modelo, nao necessariamente no ativo real instalado.
  - `backend/src/modules/generators/dto/create-generator.dto.ts`: DTO acompanha os campos atuais, sem motor/alternador/QTA/bateria/tensao por ativo.
- Impacto: o tecnico precisa desses dados no campo; sem eles, OS, laudo, proposta tecnica e historico do ativo perdem precisao.
- Recomendacao: criar bloco tecnico no cadastro/detalhe do equipamento. Campos de modelo podem preencher defaults, mas o ativo deve permitir sobrescrever informacoes reais.
- Esforco estimado: Alto se houver migration; Medio se iniciar com campos derivados/defaults.
- Status: Confirmado

### UX20A-07 - Estoque nao tem detalhe operacional do item/saldo

- Prioridade: Alto
- Categoria: UX operacional / suprimentos
- Problema: a tela de estoque e um resumo; a acao principal abre o catalogo, nao uma pagina operacional de estoque com saldos, movimentos, compras, OS e fornecedores.
- Evidencia encontrada:
  - `frontend/app/dashboard/inventory/page.tsx`: usa `/inventory/summary` e o link de acao aponta para `/dashboard/catalog/:catalogItemId`.
  - `backend/src/modules/inventory/inventory.service.ts`: `summary()` retorna balances e item; movimentos e origens existem em services, mas nao sao apresentados como detalhe operacional.
  - `backend/prisma/schema.prisma`: `CatalogItem` se relaciona com `inventoryBalances`, `inventoryMovements`, `purchaseOrderItems`, `maintenanceOrderMaterials` e `supplierItems`.
- Impacto: usuario nao consegue investigar rapidamente por que ha saldo, reserva, falta ou consumo de uma peca.
- Recomendacao: criar pagina de detalhe de estoque por item/almoxarifado com saldo fisico/reservado/disponivel, movimentos, reservas por OS, compras abertas/recebidas e fornecedores.
- Esforco estimado: Medio
- Status: Confirmado

### UX20A-08 - Ajuste de estoque aparece na UI sem checagem frontend de permissao

- Prioridade: Medio
- Categoria: RBAC / UX
- Problema: a tela renderiza o formulario/botao de ajuste manual sem evidenciar checagem frontend de `inventory.adjust`.
- Evidencia encontrada:
  - `frontend/app/dashboard/inventory/page.tsx`: formulario de ajuste chama `/inventory/adjust`.
  - `backend/src/modules/inventory/inventory.controller.ts`: `POST /inventory/adjust` esta protegido por `@RequireAccessPolicy('inventory.adjust')`.
- Impacto: o backend protege a regra, mas usuarios sem permissao podem ver uma acao que falha. Isso gera ruido operacional e tickets desnecessarios.
- Recomendacao: esconder/desabilitar ajuste manual quando o token nao tiver `inventory.adjust`; manter backend como fonte final de autorizacao.
- Esforco estimado: Baixo
- Status: Confirmado

### UX20A-09 - Catalogo mascara custos no backend, mas detalhe ainda precisa UX de permissao

- Prioridade: Baixo/Medio
- Categoria: UX / dados sensiveis
- Problema: o backend mascara custo/margem/imposto corretamente para usuario sem permissao, mas a tela de detalhe deve evitar exibicao confusa de cards vazios/nulos.
- Evidencia encontrada:
  - `backend/src/modules/catalogs/catalogs.service.ts`: `findOne()` chama `maskCatalogValues()`; sem `catalog.viewCosts`, `costPrice`, `taxPercentage` e `profitMargin` viram `null`.
  - `frontend/app/dashboard/catalog/[id]/page.tsx`: mostra cards de custo/margem/imposto no detalhe.
  - `frontend/app/dashboard/catalog/page.tsx`: a lista ja usa `catalog.viewCosts` para esconder colunas sensiveis.
- Impacto: nao e vazamento confirmado no backend, mas pode causar UX inconsistente no detalhe.
- Recomendacao: aplicar no detalhe o mesmo padrao da lista: ocultar cards financeiros sem `catalog.viewCosts` ou exibir "restrito".
- Esforco estimado: Baixo
- Status: Parcial

### UX20A-10 - Links cruzados existem de forma desigual

- Prioridade: Alto
- Categoria: navegabilidade operacional
- Problema: alguns detalhes sao muito bem conectados, principalmente Equipamento e Cliente, mas OS, Proposta, Contrato e Estoque ainda deixam entidades importantes como texto simples ou links genericos.
- Evidencia encontrada:
  - `frontend/app/dashboard/equipments/[id]/page.tsx`: tem links para cliente, contrato, itens de catalogo, propostas, OS, tickets e laudos.
  - `frontend/app/dashboard/orders/[id]/page.tsx`: tem link para equipamento e contrato, mas cliente aparece como informacao textual; chamados de origem nao aparecem no include `orderInclude()`.
  - `backend/src/modules/maintenance-orders/maintenance-orders.service.ts`: `orderInclude()` inclui `generator.client`, `site`, `materials`, `technician`, `contract`, mas nao inclui `sourceTickets`.
  - `frontend/app/dashboard/proposals/[id]/page.tsx`: cliente/equipamento aparecem como valores, mas nao como links diretos.
  - `frontend/app/dashboard/contracts/[id]/page.tsx`: proposta, equipamentos e OS preventivas tem links; cliente aparece como texto; financeiro leva para pagina generica de contas a receber.
  - `frontend/app/dashboard/inventory/page.tsx`: link leva ao catalogo, nao a movimentos, fornecedores, compras ou OS.
- Impacto: o usuario perde contexto e tempo abrindo listas, filtrando manualmente e procurando relacoes que ja existem no banco.
- Recomendacao: criar componente padrao de link contextual e padronizar deep links com filtros (`clientId`, `contractId`, `generatorId`, `sourceId`).
- Esforco estimado: Medio
- Status: Confirmado

### UX20A-11 - Responsividade/zoom das telas alvo nao esta evidenciada

- Prioridade: Medio/Alto
- Categoria: responsividade / QA visual
- Problema: nao ha evidencia automatizada de zoom 110%, 125%, 150%, sidebar aberta/fechada, notebook e tabelas largas nas telas auditadas.
- Evidencia encontrada:
  - `frontend/e2e/screenshots.spec.ts`: cobre desktop `1366x768` e mobile `375x812`, mas nao cobre Perfil, Agentes, Equipamentos, Estoque nem matriz de zoom.
  - `frontend/app/dashboard/layout.tsx`: shell usa `h-screen overflow-hidden` com conteudo interno rolavel.
  - `frontend/app/dashboard/equipments/new/page.tsx`: barra de acoes fixa `bottom-0` pode competir com bottom nav mobile.
  - `frontend/app/dashboard/components/SidebarNavigation.tsx`: sidebar expandida usa largura grande (`w-[18.5rem]`), o que pode comprimir tabelas em notebook/zoom.
- Impacto: risco de sobreposicao de botoes, conteudo cortado e tabelas ruins em notebook ou zoom usado por usuarios reais.
- Recomendacao: incluir matriz visual no E2E do 20B e corrigir problemas por tela, com prioridade para formulários com barras fixas e tabelas largas.
- Esforco estimado: Medio
- Status: Nao evidenciado em runtime; risco confirmado por codigo/cobertura ausente

## 4. Riscos de RBAC

| Risco | Evidencia | Severidade | Recomendacao |
|---|---|---|---|
| `people.view` permite ver `hourCost` em Agentes | `hr-admin.controller.ts`, `hr-admin.service.ts`, `hr/collaborators/page.tsx` | Critico | Criar permissao granular e mascarar no backend |
| Equipamentos usam permissao ampla de pagina | `generators.controller.ts` | Alto | Separar view/create/update/delete/manageModels |
| Ajuste de estoque aparece sem checagem frontend | `inventory/page.tsx`, `inventory.controller.ts` | Medio | Gating frontend por `inventory.adjust` |
| Catalogo detalhe precisa consistencia visual de permissao | `catalogs.service.ts`, `catalog/[id]/page.tsx` | Baixo/Medio | Ocultar cards financeiros sem `catalog.viewCosts` |
| Perfil comum poderia virar risco se reutilizar `userPublicSelect` | `users.service.ts` | Medio | Manter `getMyProfile()` separado e testado |

## 5. Campos sensiveis expostos ou protegidos

| Campo | Onde aparece | Status |
|---|---|---|
| `hourCost` | `GET /hr-admin/agents`, tabela de Agentes internos | Exposto para `people.view` |
| `hourCost` no Meu Perfil | `getMyProfile()` e `profile/page.tsx` | Nao exposto |
| `approvalDiscountLimit` no Meu Perfil | `updateMyProfile()` remove do payload | Nao exposto |
| `approvalDiscountLimit` em listagens administrativas de usuarios | `userPublicSelect` em `users.service.ts` | Sensivel; acesso depende de rotas de usuarios, nao auditado visualmente neste ciclo |
| custo/margem/imposto de catalogo | `CatalogsService.maskCatalogValues()` | Protegido no backend; UX do detalhe parcial |

## 6. Links ausentes prioritarios

| Origem | Destino esperado | Estado atual evidenciado | Prioridade |
|---|---|---|---|
| OS | Cliente | Cliente aparece como texto via `order.generator.client`; link direto nao evidenciado | Alto |
| OS | Equipamento | Link existe para `/dashboard/equipments/:id` | OK |
| OS | Contrato | Link existe para `/dashboard/contracts/:id` | OK |
| OS | Chamado de origem | `orderInclude()` nao inclui `sourceTickets`; link nao evidenciado na tela | Alto |
| OS | Laudo | Documento/relatorio existe na tela, mas link dedicado para laudo tecnico depende do fluxo atual | Medio |
| Proposta | Cliente | Cliente aparece como texto; link direto nao evidenciado | Alto |
| Proposta | Equipamento | Equipamento aparece como texto; link direto nao evidenciado | Medio |
| Proposta | Contrato | Link para contrato gerado existe | OK |
| Contrato | Cliente | Cliente aparece como texto; link direto nao evidenciado | Alto |
| Contrato | Financeiro | Link vai para contas a receber generico, sem filtro por contrato/titulo | Medio |
| Contrato | OS/preventivas | Links para OS geradas existem | OK |
| Equipamento | Cliente | Link existe | OK |
| Equipamento | OS/laudos/tickets | Links existem no detalhe | OK |
| Estoque | Fornecedor | Nao evidenciado na tela de estoque; fornecedores aparecem no catalogo sem link direto claro | Medio |
| Estoque | Compras | Nao evidenciado na tela de estoque | Alto |
| Estoque | OS/reservas/consumos | Nao evidenciado na tela de estoque | Alto |
| Estoque | Movimentos | Backend tem movimentos; pagina de detalhe operacional nao evidenciada | Alto |

## 7. Responsividade e zoom

Nao foi executado teste visual novo em browser neste ciclo; a auditoria ficou baseada em codigo e na cobertura E2E existente. Portanto, os cenarios abaixo ficam como "Nao evidenciado" ate o 20B:

| Cenario | Evidencia atual | Status |
|---|---|---|
| 100% desktop | E2E visual cobre algumas paginas, mas nao as telas alvo | Parcial |
| 110% | Sem evidencia | Nao evidenciado |
| 125% | Sem evidencia | Nao evidenciado |
| 150% | Sem evidencia | Nao evidenciado |
| Notebook | Sem viewport especifico para telas alvo | Nao evidenciado |
| Desktop com sidebar aberta | Cobertura parcial fora das telas alvo | Parcial |
| Desktop com sidebar fechada | Sem evidencia visual automatizada | Nao evidenciado |
| Tabelas largas | Varias telas usam `overflow-x-auto`, mas sem validacao visual das telas alvo | Parcial |
| Formularios com barra fixa | Risco em `equipments/new/page.tsx` por barra fixa inferior | Risco confirmado por codigo |
| Mobile bottom nav | Existe nav fixa em `layout.tsx`; conflito com barras fixas deve ser testado | Risco confirmado por codigo |

## 8. Sugestoes de migrations

### 8.1 Equipamentos

Campos que provavelmente exigem migration ou tabela complementar por ativo:

- `engineModel`
- `engineSerialNumber`
- `alternatorModel`
- `alternatorSerialNumber`
- `voltage`
- `phase`
- `frequencyHz`
- `controllerModel`
- `qtaModel`
- `qtaSerialNumber`
- `batteryModel`
- `batteryQuantity`
- `batteryInstalledAt`
- `fuelTankCapacityLiters`
- `oilCapacityLiters`
- `coolantCapacityLiters`
- `lastLoadBankTestAt`
- `lastPreventiveAt`
- `nextPreventiveAt`

Alternativa recomendada: criar `GeneratorTechnicalProfile` ou `GeneratorTechnicalSpec` 1:1 com `Generator`, mantendo `Generator` enxuto e permitindo evolucao tecnica sem poluir a tabela principal.

Campos que podem ser derivados sem migration inicial:

- cliente atual: `Generator.client`
- local atual: `Generator.currentSite`
- contrato ativo: `ServiceContractEquipment`
- ultimas OS: `MaintenanceOrder`
- ultimos laudos: `ServiceReport`
- pecas aplicadas: `MaintenanceOrderMaterial` / `InventoryMovement`
- status de contrato: contratos vinculados

### 8.2 Pessoas / Agentes

Possivel migration futura, se a separacao conceitual crescer:

- criar `CollaboratorProfile` para dados trabalhistas/operacionais do colaborador;
- manter `User` focado em autenticacao/RBAC;
- manter `ClientContact` para contatos de clientes sem acesso ao sistema;
- manter `CustomerPortalUser` ou equivalente logico para usuarios externos.

Para o 20B, a primeira correcao pode ser sem migration: mascarar campos sensiveis e reorganizar abas/respostas.

### 8.3 Estoque

Nao ha migration obrigatoria evidenciada para detalhe operacional basico. O schema ja possui relacoes suficientes para iniciar a tela:

- `InventoryBalance`
- `InventoryMovement`
- `MaintenanceOrderMaterial`
- `PurchaseOrderItem`
- `SupplierItem`
- `CatalogItem`

Migration so deve ser considerada se faltar origem formal em movimentos antigos ou se for necessario normalizar `sourceType/sourceId` para links mais fortes.

## 9. Plano de implementacao do Ciclo 20B

### Bloco 1 - Meu Perfil limpo

- Escopo: garantir que custo HH, alcada, metas e campos administrativos nunca aparecam nem sejam aceitos no perfil comum.
- Acoes:
  - manter `getMyProfile()` separado de selects administrativos;
  - reorganizar tela em dados pessoais, seguranca, disponibilidade e desempenho;
  - melhorar empty state de desempenho;
  - adicionar teste backend para rejeitar/ignorar campos administrativos no update do perfil.
- Complexidade: Baixa/Media
- Prioridade: 1

### Bloco 2 - Agentes/Pessoas reorganizado

- Escopo: separar leitura operacional de pessoas, usuarios, clientes e contatos.
- Acoes:
  - criar/usar permissao granular para `hourCost`;
  - mascarar `hourCost` no backend por padrao;
  - ajustar tela "Agentes" para deixar claro quem e colaborador, usuario, cliente portal, auditor e contato;
  - revisar impactos em `people.view`, `users.view`, `users.update`, `clients.view`.
- Complexidade: Media/Alta
- Prioridade: 2

### Bloco 3 - Equipamentos enriquecidos

- Escopo: transformar equipamento em cadastro tecnico real de grupo gerador.
- Acoes:
  - adicionar edicao de equipamento;
  - melhorar lista com status real, criticidade, contrato, local e ultima OS;
  - criar bloco tecnico com motor, alternador, tensao, QTA, bateria e horimetro;
  - decidir migration `GeneratorTechnicalSpec`.
- Complexidade: Alta se houver migration; Media se iniciar por UI/lista/edicao dos campos existentes.
- Prioridade: 3

### Bloco 4 - Estoque com detalhe editavel

- Escopo: permitir investigar e operar um item de estoque sem sair para telas genericas.
- Acoes:
  - criar detalhe por item/almoxarifado;
  - listar movimentos, reservas por OS, compras e fornecedores;
  - esconder ajuste se nao houver `inventory.adjust`;
  - linkar catalogo, fornecedor, compra e OS.
- Complexidade: Media
- Prioridade: 5

### Bloco 5 - Links inteligentes

- Escopo: reduzir navegacao manual entre modulos.
- Acoes:
  - criar componente padrao de link contextual;
  - adicionar links diretos em OS, proposta, contrato, estoque e catalogo;
  - adicionar filtros por query string em telas financeiras, OS e compras.
- Complexidade: Media
- Prioridade: 4

### Bloco 6 - Responsividade/zoom

- Escopo: corrigir sobreposicoes e garantir operacao em notebook/zoom.
- Acoes:
  - remover ou adaptar barras fixas que competem com bottom nav;
  - validar sidebar aberta/fechada;
  - revisar tabelas largas e cards densos;
  - testar 100%, 110%, 125%, 150%.
- Complexidade: Media
- Prioridade: 6

### Bloco 7 - E2E e screenshots

- Escopo: proteger as melhorias do 20B.
- Acoes:
  - adicionar screenshots de perfil, agentes, equipamentos lista/detalhe/form, estoque e catalogo detalhe;
  - adicionar testes de permissao visual para custo HH e ajuste de estoque;
  - adicionar matriz de viewport/zoom para telas criticas;
  - manter baselines oficiais em `docs/screenshots/ciclo-9` ou mover para pasta de ciclo atual se o padrao do projeto mudar.
- Complexidade: Media
- Prioridade: 7

## 10. Estimativa consolidada por bloco

| Bloco | Complexidade | Risco | Observacao |
|---|---|---|---|
| 1 - Meu Perfil limpo | Baixa/Media | Baixo | Maior parte ja esta segura no backend |
| 2 - Agentes/Pessoas | Media/Alta | Alto | Envolve RBAC e campo sensivel |
| 3 - Equipamentos | Media/Alta | Medio/Alto | Pode exigir migration |
| 4 - Estoque detalhe | Media | Medio | Reaproveita relacoes existentes |
| 5 - Links inteligentes | Media | Baixo/Medio | Muito ganho operacional com pouca regra nova |
| 6 - Responsividade/zoom | Media | Medio | Precisa validacao visual real |
| 7 - E2E/screenshots | Media | Baixo | Deve acompanhar os blocos implementados |

## 11. Recomendacao objetiva

Implementar primeiro o que reduz risco de seguranca e confusao operacional:

1. Corrigir exposicao de `hourCost` em Pessoas/Agentes e limpar o Meu Perfil.
2. Reorganizar Agentes/Pessoas para separar colaborador, usuario, cliente portal, auditor e contato.
3. Adicionar edicao e lista melhor de Equipamentos usando campos ja existentes.
4. Adicionar links inteligentes em OS, Proposta, Contrato e Equipamento.
5. Criar detalhe operacional de Estoque.
6. Enriquecer Equipamentos com migration tecnica somente depois de aprovar os campos.
7. Fechar com E2E visual/responsivo cobrindo zoom e sidebar.

O Ciclo 20B nao deve comecar por uma migration grande. A melhor entrada e pequena e segura: mascarar dados sensiveis, simplificar Meu Perfil, ajustar RBAC/visibilidade e criar links diretos. Isso melhora o sistema rapidamente sem desmontar o checkpoint saudavel do Ciclo 19.

