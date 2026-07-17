# Rollback runbook

## Objetivo

Definir rollback seguro para staging/piloto sem apagar evidencias e sem restaurar banco sobre alvo errado.

## Criterios para rollback

- Deploy indisponibiliza backend ou frontend.
- Migration causa erro critico.
- Healthcheck de banco ou storage falha de forma persistente.
- Fluxos criticos de login, laudos ou financeiro falham apos deploy.
- Vazamento de configuracao sensivel e identificado.

## Responsaveis

- Responsavel tecnico pelo deploy.
- Responsavel pelo banco.
- Responsavel operacional da MANITEC.
- Responsavel por validacao de negocio.

## Ordem das acoes

1. Congelar novos deploys.
2. Preservar logs, traces, commit, tag, horario e prints relevantes.
3. Confirmar ambiente afetado.
4. Validar ultimo backup disponivel.
5. Voltar aplicacao para tag ou imagem anterior.
6. Rodar healthchecks.
7. Rodar smoke E2E seguro.
8. Se banco foi afetado, restaurar backup em banco descartavel primeiro.
9. Aprovar ou rejeitar restore no banco alvo somente com validacao humana.

## Aplicacao

Checkpoint validado:

```powershell
git checkout v0.17-pilot-ready
```

Nao apagar migrations ja aplicadas. Se migration incompatvel foi aplicada, documentar estrategia manual antes de alterar dados.

## Banco

Restore sempre inicia em banco descartavel:

```powershell
.\scripts\restore-db.ps1 -BackupPath CAMINHO_DO_BACKUP -BackendDir .\backend -ConfirmRestore
```

Nunca restaurar sobre banco principal sem aprovacao humana explicita.

## Validacao apos rollback

- `/health`
- `/health/db`
- `/health/storage`
- login admin
- login cliente
- portal
- laudo/documento
- financeiro basico
