# Hardening operacional - Ciclo 17

## RBAC critico

Politicas que devem permanecer protegidas nos E2E/regressao:

- Cliente externo acessa apenas `/portal` e APIs `customer-portal`.
- Tecnico acessa area tecnica, mas nao financeiro interno.
- Comercial nao deve operar conciliacao bancaria.
- Auditor pode consultar financeiro, mas nao importar/conciliar/fechar.
- Alteracao de usuarios/permissoes fica em permissoes administrativas.
- Documentos/laudos usam permissoes especificas para gerar documento, PDF e links publicos.

## Rotas publicas

Rotas publicas aceitas:

- `/public/service-reports/verify/:token`
- `/public/service-reports/share/:token`
- downloads publicos autorizados por token valido

Regras:

- token invalido retorna erro legivel sem detalhe interno;
- token expirado bloqueia;
- token revogado bloqueia;
- documento revogado bloqueia;
- `storageKey` nunca deve ser exposto ao frontend, portal ou publico;
- download passa pelo backend.

## Logs e auditoria

Logs operacionais devem evitar:

- tokens JWT/refresh;
- senhas;
- segredos MFA;
- chaves S3;
- `storageKey` em respostas publicas;
- dumps de payload financeiro sensivel.

Auditorias esperadas:

- login/sessao;
- downloads e acessos documentais;
- revogacao documental;
- baixa financeira;
- estorno;
- conciliacao bancaria;
- fechamento/reabertura bancaria;
- alteracao de usuarios/permissoes;
- criacao/revogacao de links publicos.

## Healthchecks

- `/health`: app, banco e storage em resumo.
- `/health/db`: conectividade e diagnostico de migrations.
- `/health/storage`: driver/configuracao de storage sem vazar path ou credencial.

## Pendencias para producao plena

- Centralizacao externa de logs.
- Alertas de falha em jobs/backups.
- Politica formal de fechamento com `allowOpenIssues`.
- Rotina automatica de backup.
- Rotina de teste de restore.
- Revisao LGPD com encarregado juridico.
