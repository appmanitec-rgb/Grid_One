# Ativos e Operacoes - Arquitetura Core (Ativo no Centro)

## Premissa
O gerador e a entidade central do sistema. Contratos, O.S., telemetria, custos e despacho orbitam esse ativo.

## Evolucao de dados implementada

### Ativos
- `Generator` ganhou `lifecycleStatus`:
  - `AVAILABLE`, `LEASED`, `IN_MAINTENANCE`, `SCRAP`
- `Generator` ganhou `currentSiteId` (local fisico atual).
- `GeneratorModel` ganhou campos tecnicos:
  - `defaultPowerKw`, `controllerType`, `engineModel`, `alternatorModel`
- `GeneratorManual` para anexar manuais/diagramas por modelo.
- `Site` para representar Locais/Obras com GPS e restricoes de acesso.

### Operacoes
- `MaintenanceOrder` ganhou:
  - `type` (`PREVENTIVE`, `CORRECTIVE`, `INSTALLATION`, `DEMOBILIZATION`, `REFUELING`)
  - `customerReport`, `checklistData`, `customerSignatureUrl`
  - eventos de jornada (`displacementStartedAt`, `startedAt`, `pausedAt`, `finishedAt`)
  - `laborHours`, `hourMeterAfter`, `siteId`
- `MaintenanceOrderMaterial` para materiais aplicados e reserva de estoque.
- `TechnicianCertification` para bloqueios de despacho por certificacao vencida (ex: NR-35).

### Telemetria
- `TelemetryEvent` para ingestao de sinais IoT por gerador.
- `ServiceContract.includesFuelManagement` para habilitar automacao de abastecimento.

## Regras de negocio implementadas

### 1) Bloqueio comercial por status do ativo
No cadastro/edicao de contrato, o sistema impede alocacao de gerador em `IN_MAINTENANCE` ou `SCRAP`.

### 2) O.S. com reserva de estoque
Ao criar/editar O.S. com materiais, o backend valida saldo e baixa `stockCurrent` no ato da reserva.

### 3) Horimetro e ciclo de manutencao
Ao concluir O.S.:
- atualiza `hourMeter` do gerador (maior valor entre atual e informado)
- retorna ativo para `AVAILABLE` (exceto se estiver `SCRAP`)

Ao abrir O.S. corretiva/preventiva/desmobilizacao:
- ativo vai para `IN_MAINTENANCE`

### 4) Bloqueio de certificacao tecnica (NR-35)
Se checklist indicar exigencia de NR-35, o backend valida certificacao vigente do tecnico antes de salvar O.S.

### 5) Automacao por telemetria (baixo combustivel)
Endpoint `POST /telemetry/events`:
1. recebe evento de alarme
2. grava `TelemetryEvent`
3. valida contrato ativo com `includesFuelManagement=true`
4. cria O.S. automatica de `REFUELING` com prioridade `HIGH` (se nao houver OS aberta equivalente)

### 6) Automacao de preventivas por contrato
Endpoint `POST /contracts/automation/preventive-run` processa contratos ativos/renovacao e gera O.S. preventivas futuras com base no agendamento.

## Novas rotas de frontend
- `/dashboard/dispatch` (Painel de Despacho)
- `/dashboard/technicians` (Equipe de Tecnicos)

## Novos endpoints de backend
- `POST /telemetry/events`
- `POST /contracts/automation/preventive-run`
- CRUD `sites`:
  - `POST /sites`, `GET /sites`, `GET /sites/:id`, `PATCH /sites/:id`, `DELETE /sites/:id`
