# Ciclo 20B - Agentes, Perfil e Dados Sensiveis

Base de origem: `0ef3f6c docs: ciclo 20a auditoria ux operacional`
Checkpoint anterior funcional: `f78ac47 feat: ciclo 19 motor de templates pdf profissionais`
Relatorio base: `docs/ciclo-20a-auditoria-ux-operacional.md`

## 1. Resumo executivo

O Ciclo 20B corrigiu o ponto mais critico encontrado no 20A: `hourCost` e campos sensiveis de pessoas deixaram de ser expostos apenas por `people.view`.

A correcao foi feita no backend e refletida no frontend. A API de Agentes agora calcula se o ator pode ver dados sensiveis e so inclui `hourCost` quando a politica permite. A tela de Agentes tambem passou a renderizar a coluna `Custo HH` apenas quando o backend e o token local confirmam `people.viewSensitive`.

O ciclo nao alterou PDF, financeiro, staging, estoque, equipamentos, migrations ou regras de negocio fora de Pessoas/Perfil/RBAC.

## 2. Problema do hourCost

Antes:

- `GET /hr-admin/agents` era protegido por `people.view`.
- `HrAdminService.listAgentsOverview()` selecionava `hourCost`.
- `frontend/app/dashboard/hr/collaborators/page.tsx` renderizava sempre `Custo HH` em colaboradores internos.

Depois:

- `people.view` continua permitindo acessar Agentes.
- `hourCost` so e selecionado quando o ator tem `people.viewSensitive` ou `people.manageSensitive`.
- A resposta de `GET /hr-admin/agents` inclui `access.canViewSensitivePeople`.
- A tela so exibe a coluna de custo se backend e frontend confirmarem permissao.
- Auditor com `people.view` sem permissao sensivel nao recebe `hourCost`.
- Retornos padrao de OS e Tecnicos tambem deixaram de incluir `hourCost`, preservando o uso interno para calculo de custo quando necessario.
- Cliente segue bloqueado no endpoint interno.

## 3. Permissoes criadas/ajustadas

Novas permissoes:

- `people.viewSensitive`
- `people.manageSensitive`

Arquivos:

- `backend/src/modules/auth/access-policy.decorator.ts`
- `backend/src/modules/users/access-policy.ts`
- `frontend/lib/access.ts`
- `frontend/app/dashboard/control/page.tsx`

Politica padrao:

- Admin: acesso total via `allAccessPolicy`.
- Manager: `people.viewSensitive` e `people.manageSensitive`.
- HR/Pessoas: `people.viewSensitive` e `people.manageSensitive`.
- Auditor: `people.view`, sem sensiveis por padrao.
- Tecnico, Comercial, Cliente: sem sensiveis por padrao.

## 4. Separacao Agentes/Pessoas

Mantida a organizacao por abas:

- Colaboradores internos
- Usuarios do sistema
- Clientes
- Auditores

Ajustes:

- Backend passou a receber o ator no controller de RH.
- `internalUsers` nao inclui usuarios `CLIENT` nem `AUDITOR`.
- `portalUsers` lista usuarios `CLIENT` vinculados a clientes.
- `clients` lista cadastros comerciais de clientes.
- `auditors` fica separado.
- `systemUsers` continua consolidado para visao de acesso, mas sem custo HH quando a permissao nao permite.

Arquivos:

- `backend/src/modules/hr-admin/hr-admin.controller.ts`
- `backend/src/modules/hr-admin/hr-admin.service.ts`
- `backend/src/modules/maintenance-orders/maintenance-orders.service.ts`
- `backend/src/modules/technicians/technicians.service.ts`
- `frontend/app/dashboard/hr/collaborators/page.tsx`

## 5. Meu Perfil

O backend ja estava protegido e foi preservado:

- `getMyProfile()` nao seleciona `hourCost`, `approvalDiscountLimit` ou `accessPolicy`.
- `updateMyProfile()` remove campos administrativos e sensiveis do payload.
- Testes existentes continuam garantindo esse comportamento.

Nao foi feita grande reformulacao visual do Meu Perfil neste ciclo, para manter o escopo pequeno.

## 6. RBAC

Regras implementadas:

- `people.view` nao implica ver custo HH.
- `people.viewSensitive` permite visualizar dados sensiveis de pessoas.
- `people.manageSensitive` permite editar campos sensiveis de usuario via `UsersService`.
- `users.manage` sozinho nao basta para alterar `hourCost`, `approvalDiscountLimit`, `salesTargetMonthly` ou `kpiTargetJson`.
- A tela de Controle de Usuarios so mostra/envia campos sensiveis quando o operador tem `people.manageSensitive`.
- A tela de Custos deixou de depender de `hourCost` vindo de OS e passou a apresentar apenas alocacao tecnica sem custo HH.
- Chamadas internas sem ator continuam compatíveis com seeds/rotinas.

## 7. Testes

Testes backend criados/ajustados:

- `backend/src/modules/hr-admin/hr-admin.service.spec.ts`
  - `people.view` sem sensivel nao seleciona `hourCost`.
  - `people.viewSensitive` seleciona `hourCost`.
  - Agentes continuam separados em internos, portal, clientes e auditores.

- `backend/src/modules/users/access-policy.spec.ts`
  - Manager e HR possuem permissoes sensiveis.
  - Tecnico, Comercial, Auditor e Cliente nao recebem permissoes sensiveis por padrao.

- `backend/src/modules/users/users.service.spec.ts`
  - Meu Perfil segue sem dados administrativos.
  - Update proprio ignora `hourCost`, alcada e policy.
  - Ator sem `people.manageSensitive` nao altera `hourCost`.
  - Ator com `people.manageSensitive` altera `hourCost`.

E2E ajustado:

- `frontend/e2e/ux-operational.spec.ts`
  - Admin ve `Custo HH`.
  - Auditor acessa Agentes sem receber `hourCost` da API.
  - Auditor nao ve coluna `Custo HH`.
  - Auditor nao recebe `hourCost` em retornos de OS e Tecnicos.
  - Cliente recebe `403` em `/hr-admin/agents`.

## 8. Validacoes executadas

Backend:

- `npm run env:check`: passou.
- `npm run db:preflight`: passou, banco `gridone_db`, 44 migrations.
- `npx prisma migrate status`: passou, schema atualizado.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm test -- --runInBand`: passou, 32 suites / 179 testes.
- `npm run seed:flow`: primeira execucao bloqueou por ausencia de `SEED_DEMO_PASSWORD`; reexecutado com `SEED_DEMO_PASSWORD=Demo@123456` apenas na sessao do comando e passou.

Frontend:

- `npm run lint`: passou.
- `npm run build`: primeira execucao falhou por rede bloqueada ao baixar Google Fonts do Next; reexecutado com rede liberada e passou.
- `npm run e2e`: passou, 47 testes / 1 staging remoto skipado.

Observacao de screenshots:

- O E2E regenerou screenshots em `docs/screenshots/ciclo-9`.
- Um baseline (`desktop-portal-chamados.png`) capturou estado de loading.
- Os screenshots foram restaurados e nao fazem parte do escopo do commit do 20B.

## 9. Arquivos alterados

- `backend/src/modules/auth/access-policy.decorator.ts`
- `backend/src/modules/hr-admin/hr-admin.controller.ts`
- `backend/src/modules/hr-admin/hr-admin.service.ts`
- `backend/src/modules/maintenance-orders/maintenance-orders.service.ts`
- `backend/src/modules/technicians/technicians.service.ts`
- `backend/src/modules/hr-admin/hr-admin.service.spec.ts`
- `backend/src/modules/users/access-policy.ts`
- `backend/src/modules/users/access-policy.spec.ts`
- `backend/src/modules/users/users.service.ts`
- `backend/src/modules/users/users.service.spec.ts`
- `frontend/lib/access.ts`
- `frontend/app/dashboard/costs/page.tsx`
- `frontend/app/dashboard/control/page.tsx`
- `frontend/app/dashboard/hr/collaborators/page.tsx`
- `frontend/e2e/ux-operational.spec.ts`
- `docs/ciclo-20b-agentes-perfil-dados-sensiveis.md`

## 10. Riscos restantes

- A tela de Agentes ainda e uma visao consolidada; a separacao conceitual ficou melhor, mas ainda pode evoluir para paginas dedicadas de Colaboradores, Usuarios, Clientes/Contatos e Auditores.
- `listCollaborators()` ainda retorna usuarios nao CLIENT para telas de selecao; auditores seguem fora da aba de colaboradores em Agentes, mas uma revisao futura pode separar tambem endpoints de selecao operacional.
- `approvalDiscountLimit` continua existindo em rotas administrativas de usuarios; agora a edicao sensivel foi protegida, mas uma revisao futura pode mascarar leitura em listagens de usuarios para perfis com `users.manage` sem `people.viewSensitive`.
- Screenshots E2E precisam de espera mais forte no portal de chamados para nao capturar loading em execucoes futuras.

## 11. Pendencias

- Criar paginas/rotas mais especificas para Colaboradores, Usuarios, Clientes/Contatos e Auditores.
- Revisar leitura de campos sensiveis no modulo completo de Controle de Usuarios.
- Criar E2E visual dedicado para Perfil e Agentes em desktop/mobile.
- Corrigir o runner visual para esperar dados do Portal antes de capturar `desktop-portal-chamados.png`.

## 12. Recomendacao para Ciclo 20C

O proximo bloco deve ser:

`Ciclo 20C - Equipamentos tecnicos completos`

Ordem recomendada:

1. Melhorar lista de equipamentos com status real, cliente, contrato, criticidade e ultima OS.
2. Criar edicao de equipamento usando campos ja existentes.
3. Definir, antes de migration, o modelo tecnico de grupo gerador: motor, alternador, QTA, bateria, tensao, tanque, horimetro e componentes.
4. So depois criar migration para `GeneratorTechnicalSpec` ou equivalente.
