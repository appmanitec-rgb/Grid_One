# Ciclo 9 - Playwright E2E e QA automatizado

Este ciclo transforma o roteiro manual do Ciclo 8 em validacao real no navegador com Playwright. O objetivo e provar login, RBAC, isolamento de cliente, area tecnica, chamados, laudos, PDF, links publicos e rotas principais antes de novas features.

## Preparacao do ambiente

1. Backend e frontend usam portas locais padrao:
   - API: `http://127.0.0.1:3000`
   - Frontend: `http://127.0.0.1:3001`
2. O Playwright inicia os dois servidores automaticamente pelo `frontend/playwright.config.ts`.
3. Variaveis aceitas:
   - `E2E_API_URL`: sobrescreve a URL da API.
   - `E2E_BASE_URL`: sobrescreve a URL do frontend.
   - `SEED_DEMO_PASSWORD` ou `E2E_DEMO_PASSWORD`: senha dos usuarios demo.
   - `E2E_TOTP_SECRET`: segredo TOTP ficticio usado pelos usuarios internos do seed.
   - `E2E_RUNNER_TIMEOUT_MS`: timeout maximo total do runner. Padrao: 45 minutos.
   - `E2E_PLAYWRIGHT_GLOBAL_TIMEOUT_MS`: timeout global repassado ao Playwright.
   - `E2E_MAX_FAILURES`: maximo de falhas antes de parar. Padrao diagnostico: `1`; use `0` para desativar.
   - `E2E_VERBOSE_SERVER=1`: mostra logs completos de backend/frontend durante o E2E.
   - `E2E_THROTTLE_LIMIT`: limite de throttling usado pelo backend durante E2E. Padrao: `10000`.
4. Antes da suite E2E, rode o seed controlado:

```powershell
cd backend
$env:SEED_DEMO_PASSWORD = "Demo@123456"
npm run seed:flow
```

O seed cria arquivos locais privados em `backend/storage` para simular PDF/evidencia. Essa pasta e runtime local e nao deve ser versionada.

## Comandos

Backend:

```powershell
cd backend
npm run db:migrate
npx prisma generate
npx prisma migrate status
npm run seed:flow
npm run lint
npm run build
npm test -- --runInBand
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
npm run e2e
```

Scripts Playwright disponiveis:

- `npm run e2e`: executa a suite headless.
- `npm run e2e:headed`: executa com navegador visivel.
- `npm run e2e:ui`: abre a interface do Playwright.
- `npm run e2e:report`: abre o relatorio HTML gerado localmente.

Para diagnostico, rode um spec por vez:

```powershell
npm run e2e -- e2e/auth.spec.ts
npm run e2e -- e2e/client-portal.spec.ts
npm run e2e -- e2e/technician.spec.ts
npm run e2e -- e2e/service-reports.spec.ts
npm run e2e -- e2e/public-links.spec.ts
npm run e2e -- e2e/smoke-navigation.spec.ts
npm run e2e -- e2e/screenshots.spec.ts
npm run e2e -- e2e/customer-ticket-to-order.spec.ts
```

O runner sempre aplica `--workers=1`, `--global-timeout` e, por padrao, `--max-failures=1`, alem de encerrar a arvore de processos de backend, frontend e Playwright ao final. Durante E2E, ele sobe o backend com throttling alto para evitar falso negativo em navegacao/screenshot local pesada. `npm run e2e` nao deve ficar rodando indefinidamente.

## Credenciais demo

Senha padrao: `Demo@123456`

Usuarios internos usam MFA TOTP ficticio com segredo E2E: `JBSWY3DPEHPK3PXP`. A suite gera o codigo TOTP automaticamente.

| Perfil | E-mail |
| --- | --- |
| Admin | `admin.demo@manitec.local` |
| Gestor | `gestor.demo@manitec.local` |
| Comercial | `vendas.demo@manitec.local` |
| Operacao | `operacao.demo@manitec.local` |
| Tecnico | `tecnico.demo@manitec.local` |
| Financeiro | `financeiro.demo@manitec.local` |
| Suprimentos | `suprimentos.demo@manitec.local` |
| RH/Pessoas | `pessoas.demo@manitec.local` |
| Auditor | `auditor.demo@manitec.local` |
| Cliente A | `cliente.a.demo@manitec.local` |
| Cliente B | `cliente.b.demo@manitec.local` |

## Dados E2E criados pelo seed

- Cliente A e Cliente B com equipamentos separados.
- Chamados `TCK-E2E-A` e `TCK-E2E-B`.
- OS principal do tecnico demo.
- OS de Cliente B atribuida a tecnico secundario.
- Laudos `LR-E2E-90001` e `LR-E2E-90002`.
- PDF e evidencia armazenados no file-storage local.
- Link publico valido, expirado e revogado.
- Token publico de validacao do laudo.

## Fluxos cobertos

- Login UI por perfil: Admin, Gestor, Comercial, Operacao, Tecnico, Financeiro, Cliente A e Cliente B.
- RBAC por menu e por URL direta para Admin, Tecnico, Financeiro e Cliente.
- Isolamento Cliente A/B em equipamentos, chamados, laudos e downloads.
- Cliente cria chamado e Operacao converte em OS sem duplicidade.
- Tecnico visualiza somente OS propria, faz check-in, bloqueia check-in duplicado e faz check-out.
- Laudo interno com PDF armazenado, hash e download autorizado.
- Portal do cliente visualiza laudo liberado e baixa PDF/evidencia sem campos internos.
- Link publico de laudo valido, invalido, expirado e revogado.
- Verify publico de documento valido e invalido.
- Smoke test das rotas internas, portal e publicas.
- Screenshots baseline desktop e mobile.

## Screenshots

Os screenshots de regressao ficam em:

```text
docs/screenshots/ciclo-9/
```

Viewports usados:

- Desktop: `1366x768`
- Mobile: `375x812`

## Fluxos nao cobertos neste ciclo

- Comparacao visual automatizada pixel-a-pixel.
- Storage externo real, S3, MinIO ou Supabase.
- Editor visual de templates de laudo.
- Assinatura digital formal com cadeia juridica.
- Testes com banco isolado descartavel por worker.
- Teste de carga ou concorrencia.

## Como interpretar falhas

1. Falha de login interno quase sempre indica seed nao executado, senha diferente ou MFA E2E fora de sincronismo.
2. Falha em download de PDF normalmente indica ausencia dos arquivos locais gerados pelo seed em `backend/storage`.
3. Falha de isolamento Cliente A/B deve ser tratada como critica.
4. Falha em smoke de rota deve ser analisada como regressao de frontend, permissao ou API.
5. Falhas com Google Fonts no `next build` podem exigir rede liberada no ambiente.

## Relatorio final de execucao

Data da validacao: 2026-07-14.

O travamento original de `npm run e2e` foi causado pelo runner iniciar backend e frontend com `stdout`/`stderr` em modo `pipe` sem drenar os streams quando `E2E_VERBOSE_SERVER` estava desligado. Depois de muitos logs, o buffer do processo filho enchia, o servidor parava de responder e chamadas HTTP simples pareciam travadas. O runner agora drena sempre os streams e imprime logs somente quando `E2E_VERBOSE_SERVER=1`.

Correcoes aplicadas:

- Runner E2E com timeout global obrigatorio, `--workers=1`, `--global-timeout`, `--max-failures=1`, logs de spec, preflight de banco e encerramento de arvore de processos no Windows.
- Helper E2E de API com timeout real por request via `http/https.request`, sem pool persistente e com mensagens objetivas.
- Login UI E2E mais estavel contra hidratacao do React/Next em dev server.
- Fluxo Cliente -> Chamado -> OS validado com criacao de chamado por API autenticada do portal, detalhe no portal, conversao pela UI interna e bloqueio de duplicidade.
- Screenshots de regressao separados em spec proprio.
- Artefatos locais de Playwright, storage e debug ignorados no Git.

Resultados finais:

| Validacao | Resultado |
| --- | --- |
| Processos `node`/`npm` presos | Nao encontrados |
| Backend `npm run db:preflight` | Passou, `gridone_db`, 38 migrations |
| Backend `npx prisma migrate status` | Passou, schema atualizado |
| Backend `npm run lint` | Passou |
| Backend `npm run build` | Passou |
| Backend `npm test -- --runInBand` | Passou, 26 suites / 124 testes |
| Frontend `npm run lint` | Passou |
| Frontend `npm run build` | Passou com rede liberada para Google Fonts |
| Frontend `npm run e2e` | Passou, 36 testes em 7,7 min |
| `git diff --check` | Passou, apenas avisos CRLF/LF do Windows |

## Proximos passos

- Adicionar banco E2E isolado e reset seguro dedicado.
- Evoluir screenshots para comparacao visual controlada.
- Cobrir Comercial, Financeiro e Suprimentos com fluxos E2E transacionais.
- No Ciclo 10, avancar para storage externo real, retencao, auditoria de downloads e assinatura digital mais formal.
