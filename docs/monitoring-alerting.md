# Monitoring and alerting

## Estado atual

O backend emite logs HTTP estruturados em JSON via stdout com:

- `requestId`;
- timestamp;
- ambiente;
- versao;
- metodo;
- rota sanitizada;
- status;
- duracao;
- usuario por ID;
- IP.

Nao ha plataforma externa configurada neste repositorio. Monitoramento externo deve ser configurado no provedor de staging.

## Mascaramento

Logs nao devem expor:

- `Authorization`;
- cookies;
- senha;
- token;
- `DATABASE_URL`;
- chaves S3;
- `storageKey`;
- corpo de arquivos.

## Alertas criticos

- Backend indisponivel.
- Banco indisponivel.
- Storage indisponivel.
- Migration incompatvel.
- Falha repetida de login.
- Erro 500 repetido.
- Backup falhou.
- Restore de teste falhou.

## Alertas de aviso

- Armazenamento proximo do limite.
- Divergencia de saldo.
- Fechamento bancario com ressalva.
- Links publicos com falhas repetidas.
- Documentos proximos de expiracao.
- SLA de chamado vencido.

## Integracao recomendada

Para staging, coletar stdout do backend e frontend em servico externo como provedor de logs da hospedagem, Grafana/Loki, Datadog, New Relic, CloudWatch ou equivalente. Este ciclo nao configura integracao externa sem credenciais reais.
