# Checklist de deploy - MANITEC Operacao Integrada

## Objetivo

Preparar um ambiente de piloto/producao com banco, API, frontend, storage documental, seguranca basica e plano de rollback.

## Requisitos

- Node.js LTS compativel com o projeto.
- npm instalado.
- PostgreSQL acessivel pela API.
- Ferramentas PostgreSQL no servidor operacional: `pg_dump` e `pg_restore`.
- Storage documental local privado para piloto ou storage S3-compatible para producao.
- HTTPS no frontend e API em producao.

## Variaveis obrigatorias do backend

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DB_NAME` ou `EXPECTED_DB_NAME`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `APP_BASE_URL`
- `FRONTEND_BASE_URL`
- `FILE_STORAGE_DRIVER`

Em producao, `JWT_SECRET` deve ser aleatorio e diferente dos exemplos. Nao commitar `.env` real.

## Variaveis opcionais/recomendadas

- `MFA_ISSUER`
- `MFA_ENCRYPTION_KEY`
- `THROTTLE_TTL_MS`
- `THROTTLE_LIMIT`
- `AUTOMATION_*`
- `RESEND_API_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `DELIVERY_WEBHOOK_SECRET`

## Storage

Piloto local:

```powershell
FILE_STORAGE_DRIVER="local"
FILE_STORAGE_LOCAL_PATH="C:\manitec-storage\private"
```

Producao S3-compatible:

```powershell
FILE_STORAGE_DRIVER="s3"
S3_ENDPOINT="https://s3.REGIAO.amazonaws.com"
S3_BUCKET="manitec-documentos"
S3_REGION="sa-east-1"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_FORCE_PATH_STYLE="false"
```

Validar:

```powershell
Invoke-RestMethod http://localhost:3000/health/storage
```

## Comandos backend

```powershell
cd backend
npm install
npm run env:check
npx prisma generate
npm run db:preflight
npm run db:migrate
npm run lint
npm run build
npm test -- --runInBand
```

Para seed demo/piloto:

```powershell
$env:SEED_DEMO_PASSWORD="senha-forte-do-piloto"
npm run seed:flow
```

## Comandos frontend

```powershell
cd frontend
npm install
npm run lint
npm run build
```

## Start

Backend dev/piloto:

```powershell
cd backend
npm run start
```

Frontend dev/piloto:

```powershell
cd frontend
npm run dev
```

Producao deve usar process manager ou plataforma gerenciada, HTTPS e variaveis configuradas fora do repositorio.

### Acesso local consolidado

O acesso dos usuarios e `http://localhost:3001`. O frontend encaminha `/api` para
`http://127.0.0.1:3000`; a API escuta somente em loopback. A porta 3000 e um
servico interno necessario, nao uma segunda versao do sistema. Nao manter
interfaces de homologacao abertas apos a ativacao.

`scripts/start-server.ps1 -Production` consulta `runtime-logs/active-release.json`
quando esse manifesto existe. Ele pode indicar `frontendDist` (`.next-release-ID`),
`backendDist` (`dist-release-ID`) e `prismaClient` (`runtime-release-ID/client`).
Os builds e o cliente Prisma dessa release devem estar prontos antes da troca;
o manifesto e os artefatos sao locais e nao entram no Git. O backend da release
usa `scripts/start-backend-release.cjs`, preservando o cliente e os builds anteriores.

Para gerar o frontend em um diretorio separado, definir `MANITEC_FRONTEND_DIST`
no build e na inicializacao, alem de `INTERNAL_API_URL=http://127.0.0.1:3000` e
`NEXT_PUBLIC_API_URL=/api`. A inicializacao pelo script fixa esse proxy e limpa
os seletores de homologacao. Se `node` nao estiver no PATH, informar `-NodePath`.

`scripts/stop-server.ps1` confere a identidade dos processos registrados antes
de encerra-los. `start-server.ps1 -Production -DefaultArtifacts` inicia os builds
padrao anteriores (`backend/dist` e `frontend/.next`), ignorando o manifesto;
essa opcao nao restaura nem altera o banco. Nao usar rollback de codigo se as
migracoes aplicadas forem incompativeis com a versao anterior.

## Checklist antes de producao/piloto

- [ ] `git status --short` sem mudancas inesperadas.
- [ ] `.env` real fora do Git.
- [ ] `JWT_SECRET` forte e trocado.
- [ ] `CORS_ORIGINS` restrito ao dominio real.
- [ ] `THROTTLE_LIMIT` adequado ao volume previsto.
- [ ] `DATABASE_URL` aponta para banco correto.
- [ ] `DB_NAME`/`EXPECTED_DB_NAME` confere com o banco.
- [ ] Backup feito antes da migration.
- [ ] `npm run db:migrate` executado com sucesso.
- [ ] `npm run db:preflight` OK.
- [ ] `/health`, `/health/db` e `/health/storage` OK.
- [ ] Storage documental testado.
- [ ] Portal do cliente testado com cliente A/B.
- [ ] Links publicos testados: valido, expirado, revogado e invalido.
- [ ] Usuario tecnico nao acessa financeiro.
- [ ] Usuario cliente nao acessa dashboard interno.
- [ ] Auditor nao altera dados.
- [ ] E2E completo passou no ambiente de staging/piloto.

## Rollback basico

1. Bloquear acesso publico temporariamente.
2. Preservar logs e backup atual.
3. Restaurar backup pre-migration, se necessario.
4. Voltar para o commit anterior validado.
5. Rodar `npm run db:preflight`.
6. Validar `/health`, login admin, portal e financeiro basico.

Rollback de schema deve ser tratado com cuidado. Prefira restaurar backup quando a migration ja tiver alterado dados.
