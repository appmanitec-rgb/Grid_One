# Go-live checklist

## Ambiente

- [ ] Staging separado aprovado.
- [ ] Banco de staging separado aprovado.
- [ ] Dominio/URL estavel configurado.
- [ ] HTTPS ativo.
- [ ] CORS restrito.
- [ ] Secrets em secret manager.
- [ ] Nenhuma credencial commitada.

## Banco e dados

- [ ] Migrations aplicadas em staging.
- [ ] Seed minimo controlado.
- [ ] Dados ficticios identificados.
- [ ] Sem dados reais de clientes no staging.
- [ ] Backup gerado.
- [ ] Restore validado em banco descartavel.
- [ ] RPO/RTO registrados.

## Storage e documentos

- [ ] Bucket exclusivo de staging.
- [ ] Upload real validado.
- [ ] Download interno autorizado validado.
- [ ] Download pelo portal validado.
- [ ] PDF real validado.
- [ ] Link publico validado.
- [ ] Revogacao validada.
- [ ] Retencao documental revisada.

## Operacao

- [ ] Healthchecks externos ativos.
- [ ] Logs coletados.
- [ ] Alertas criticos configurados.
- [ ] Alertas de aviso configurados.
- [ ] Politica `allowOpenIssues` aprovada.
- [ ] Plano de rollback aprovado.
- [ ] Janela de implantacao definida.
- [ ] Responsaveis definidos.

## Seguranca e juridico

- [ ] Senhas administrativas alteradas.
- [ ] Seed demo desativado para producao.
- [ ] LGPD/juridico aprovado ou risco aceito formalmente.
- [ ] Politica financeira aprovada.
- [ ] Politica documental aprovada.
- [ ] Aceite formal do piloto registrado.

## Decisao

- [ ] Aprovado para piloto.
- [ ] Nao aprovado para piloto.
- [ ] Bloqueios registrados.
