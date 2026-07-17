# Financial closing policy

## Politica allowOpenIssues

Fechamento bancario mensal com pendencias abertas e uma excecao operacional controlada.

## Regras

- Financeiro comum nao fecha periodo com issues abertas, movimentos nao conciliados, entradas nao conciliadas ou saldo divergente.
- Admin ou Gestor pode fechar com ressalva usando `allowOpenIssues=true`.
- Fechamento com ressalva exige motivo.
- A auditoria deve registrar usuario, data, banco, competencia, quantidade de issues e divergencia.
- Reabertura exige motivo.
- Auditor possui somente leitura.

## Criterios para usar ressalva

Usar apenas quando:

- a divergencia foi revisada;
- a pendencia nao bloqueia operacao;
- existe motivo operacional claro;
- o responsavel aceita acompanhar a correcao no periodo seguinte.

## Riscos

- Fechar com ressalva pode ocultar divergencias recorrentes.
- Divergencias financeiras devem virar issue operacional ate resolucao.
- A politica deve ser aprovada por gestor financeiro antes do piloto.

## Implementacao atual

- Backend bloqueia fechamento com pendencias sem `allowOpenIssues`.
- Backend permite `allowOpenIssues` somente para `ADMIN` ou `MANAGER`.
- Auditor continua bloqueado por RBAC.
- Testes cobrem bloqueio do financeiro comum e permissao para gestor/admin.
