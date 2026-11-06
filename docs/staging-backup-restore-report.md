# Ensaio isolado de staging, backup e restore — 05/10/2026

## Resultado

Foi executado um ensaio **local e descartavel** em contêiner PostgreSQL separado do
`gridone_db` operacional. Nenhum dado de clientes foi copiado. O ensaio comprovou
bootstrap do schema atual, backup customizado com SHA-256 e restore em banco vazio.
**Ainda nao equivale a staging remoto homologado nem aprova o piloto.**

## Ambiente e isolamento

- PostgreSQL `postgres:15-alpine`, contêiner `gridone_stage_rehearsal`, porta
  `127.0.0.1:5544`, separado do operacional `gridone_db` na porta 5433.
- Banco de origem: `gridone_stage_clean`.
- Banco de destino: `gridone_stage_restore`, criado vazio no mesmo contêiner de ensaio.
- `NODE_ENV=staging` e `DATABASE_URL` explicitamente apontados para cada banco de
  ensaio. O contêiner usou apenas dados ficticios/vazios.
- O contêiner descartavel foi encerrado apos o ensaio; `gridone_db` permaneceu ativo.

## Descoberta no deploy de banco novo

`prisma migrate deploy` falhou na migration
`20260309155103_finance_hr_core` com PostgreSQL `42P01`: a tabela
`service_contracts` nao existe naquele ponto da cadeia. Nenhuma migration anterior
cria essa tabela. **Um banco novo nao pode ser provisionado apenas com a cadeia
historica.** O banco operacional ja existente nao foi alterado.

O comando `npm run db:bootstrap:staging` foi criado para **somente banco vazio de
staging**, com nome e confirmacao explicitos. Ele executou `prisma db push`, criou
`pgcrypto` e registrou as 97 migrations historicas como aplicadas. Em seguida:

- `npm run db:preflight`: OK, 97 migrations.
- `prisma migrate status`: schema atualizado, nenhuma migration pendente.
- 129 tabelas em `public`, incluindo `_prisma_migrations`.

Esse bootstrap e uma adaptacao necessaria do historico legado. `migrate deploy`
consegue aplicar migrations novas ja geradas, mas `migrate dev` com shadow database
continua bloqueado ate reparo/rebaseline do historico. Uma implantacao remota ainda
deve repetir a verificacao em banco de staging dedicado.

## Backup

- Origem: `gridone_stage_clean`.
- Arquivo local ignorado pelo Git:
  `backend/backups/20261005-190158_gridone_stage_clean.dump`.
- Formato: custom archive do PostgreSQL, validado por `pg_restore --list`.
- Tamanho: 515530 bytes.
- SHA-256:
  `6730142def08ba5792e994dffc270f5cab0166fa7c5cc638223a8a9f18c211fc`.
- Manifesto adjacente com arquivo, tamanho, hash, banco, ambiente e origem.
- Tempo observado de comando: aproximadamente 5 segundos; volume vazio, portanto
  nao representa backup operacional.
- Destino externo criptografado: **nao configurado**.

## Restore

- Destino: `gridone_stage_restore`, verificado vazio antes da restauracao.
- Tempo observado de comando: aproximadamente 11 segundos para este dump pequeno.
- `npm run db:preflight`: OK, 97 migrations.
- `prisma migrate status`: schema atualizado.
- Comparacao origem/destino: 129 tabelas, 97 migrations e 0 clientes em ambos.
- Segunda tentativa de restore no destino ja preenchido: bloqueada antes de gravar.
- Tentativa com `RESTORE_TARGET_DB_NAME=gridone_db`: bloqueada antes de conectar.
- Manifesto com SHA-256 adulterado: bloqueado antes de conectar.
- Backup de staging sem `DB_CONTAINER` explicito: recusado para impedir fallback
  acidental ao contêiner operacional.

O script agora exige banco descartavel explicitamente identificado, recusa alvo
com tabelas e valida hash/tamanho quando ha manifesto. RPO e RTO operacionais nao
foram medidos: o ensaio nao teve carga real nem destino externo de backup.

## Verificacao do codigo

- Build backend: passou.
- Lint backend: passou sem erros ou avisos.
- Testes unitarios backend: 340/340 passaram em 53 suites.
- E2E backend de politica de acesso: 5/5 passaram.
- Sintaxe dos tres scripts Node e do wrapper PowerShell: validada.
- O teste unitario do probe local de storage confirmou gravacao, leitura,
  comparacao do conteudo e remocao do objeto temporario. Bucket S3 real ainda nao
  foi testado.

## Pendencias para homologacao remota

1. Provisionar PostgreSQL exclusivo de staging, bucket S3-compatible exclusivo,
   URLs HTTPS, CORS e segredos proprios.
2. Configurar destino de backup externo criptografado e politica de retencao.
3. Repetir backup e restore com volume representativo e banco descartavel remoto;
   medir RPO/RTO e conferir amostras de dados **ficticios**.
4. Testar leitura, gravacao e remocao no bucket pelo `/health/storage` autenticado,
   mais upload/download/PDF/link publico/revogacao pela aplicacao.
5. Ativar logs externos, alertas e ensaiar rollback de aplicacao.
6. Executar smoke remoto e registrar aceite do piloto somente apos os itens acima.
7. Planejar rebaseline seguro do historico de migrations antes de gerar novas
   migrations com shadow database; validar contra copia de schema sem dados.

**Decisao:** recuperacao local ensaiada; staging remoto e piloto ainda nao aprovados.
