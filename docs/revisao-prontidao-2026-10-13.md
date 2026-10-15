# Revisão de prontidão — conclusão em 14/10/2026

## Situação

Versão compilada e disponível em `http://localhost:3001`, com a API em modo de produção, origens explícitas e armazenamento permanente na pasta já usada pelos anexos. A revisão final reuniu 147 verificações únicas de navegador aprovadas: 63 de navegação e 84 de fluxos.

As alterações permanecem locais, sem commit ou push. O endereço público, HTTPS e supervisão após reinicialização ainda dependem do servidor definitivo.

## Correções desta revisão

| Problema encontrado | Ajuste aplicado | Evidência |
| --- | --- | --- |
| Dependências de execução com alertas críticos/altos | Next 16.3.8, Nest 11.2.6, Multer 2.4.0, Sharp 0.35.5, proxy-addr 2.0.8 e source-map-js 1.2.2 | Auditoria de execução e compilações |
| Geração do Prisma podia encerrar todos os processos Node do computador | CLI local executada diretamente; falhas preservam os demais processos | Revisão do script, sem parada indiscriminada |
| Instalador continuava após falha de npm, Docker ou migração | Verificação de cada código de saída; interrupção imediata | Simulação de saída 7 e aviso em stderr com saída 0 |
| API podia iniciar com configuração inadequada | Validador compartilhado pelo início da API e `env:check` | Testes de configurações válidas/inválidas |
| Início não identificava migrações incompletas ou colunas essenciais ausentes | Checagem de migrações e campos de propostas, financeiro, clientes e contratos | Preflight da base real e inicialização |
| Próprio perfil recebia DTO administrativo e dependia de excluir campos conhecidos | DTO exclusivo e lista explícita de dados pessoais na gravação | Validação de campos protegidos, nulos e edição permitida |
| Falha de rede podia deixar o perfil preso em “salvando” | Tratamento de erro com liberação do botão no `finally` | Verificação de tipos e fluxo de perfil |
| Códigos de situações apareciam nos relacionamentos | Nomes em português em clientes, catálogo, contratos, laudos, compras, operação e perfil | Compilação e navegação |
| Frota e comissões mostravam tabelas vazias sem contexto | Estados de carregamento, vazio e falha | Navegação e lint |
| Início podia deixar processos ativos após falhar | Limpeza somente dos processos lançados; registro de caminhos absolutos | Inicialização local aprovada |
| Parada não tinha identificação confiável dos processos | Novo `stop-server.ps1`, verificando PID, executável e caminho do projeto | Revisão e validação de sintaxe |
| Exemplo de produção exigia serviços externos opcionais | Armazenamento local permanente como padrão; integrações opcionais comentadas | Validação de ambiente sem dependências externas |
| PostgreSQL/Redis no Compose expunham portas em todas as interfaces | Configuração de acesso local; healthcheck do PostgreSQL e Redis opcional | Aplicado: porta 5433 somente em 127.0.0.1, contêiner saudável e volume original preservado |
| Executor E2E tratava aviso do Node como falha no Windows | Tratamento correto de stderr/código de saída e relatório JSON | Rodada de navegador |
| Testes novos não estavam na suíte padrão | Manifesto único com menus e 35 arquivos de fluxos | Manifesto e caminhos validados |
| CI não verificava fluxos no navegador | Job com PostgreSQL isolado, LibreOffice, menus e fluxos | YAML validado; execução remota pendente do envio ao GitHub |
| Smoke de homologação consultava diagnósticos protegidos sem token | Autenticação administrativa antes de checar banco e armazenamento | Revisão do contrato HTTP |
| Testes poderiam herdar provedores externos do ambiente | Modo manual explícito para e-mail, WhatsApp e webhook no E2E | Três testes comprovando ausência de chamadas de rede |

As funções já implementadas nas etapas anteriores permanecem: proposta em etapas com resumo financeiro, rascunho editável, revisão/aprovação, PDFs dentro da proposta, central de documentos, condições 50/50 e 30/70, entrada por valor/percentual, datas no financeiro, liberação operacional após entrada, biblioteca de escopos, central do cliente por empresa, permissões e troca de senha.

## Conclusão das pendências da revisão

- Redefinição administrativa de senha interna exige permissão de seguranção; a tela acompanha essa permissão.
- Alteração no próprio perfil exige senha atual, nova senha e confirmação. Novas senhas exigem 12 caracteres e respeitam o limite de 72 bytes do bcrypt. Senhas existentes não foram alteradas.
- Gravação da senha, revogação das sessões e registro da alteração são atômicos. Tokens de todos os perfis identificam a credencial vigente; um login concorrente com senha antiga não consegue reabrir uma sessão.
- A troca de empresa vinculada a um login da central também exige permissão de seguranção, para impedir transferência de acesso por quem gerencia apenas cadastros.
- Tokens de desafio MFA não são aceitos como tokens de acesso.
- Erros de regras comerciais retornam 400/403 em vez de 500. Logs registram o status de erro real e ocultam tokens de compartilhamento.
- Propostas ganhas com entrada pendente apontam primeiro para a confirmação financeira, inclusive nos diferentes tipos de proposta.
- A descoberta de menus dos testes inclui as dez rotas da central do cliente. O ambiente isolado utiliza chave JWT própria e temporária, sem reutilizar a chave de produção.
- Os testes de navegador também podem usar build de produção isolado; o início verifica os artefatos e a parada verifica PID e caminho do projeto.
- A recuperação do backup foi comprovada em PostgreSQL temporário sem portas publicadas, e esse ambiente foi removido. Foram recuperados 19 usuários, 2.504 clientes e 3 propostas. O histórico possui 105 registros; as 103 migrações aplicáveis estão em dia.
- O Compose fixa o projeto `manitec_gridone` para reutilizar o volume `manitec_gridone_gridone_pgdata`; configuração e credenciais foram comparadas com o contêiner existente sem divulgá-las.

## Validações

| Verificação | Resultado |
| --- | --- |
| Testes unitários da API | **453 aprovados, 63 suítes** |
| Testes HTTP de autorização | **5 aprovados** |
| Lint backend | **0 erros** |
| Lint frontend | **0 erros** |
| Compilação de produção backend | **Aprovada** |
| Compilação de produção frontend | **Aprovada** |
| TypeScript frontend | **Aprovado** |
| Base real | **Preflight aprovado, 103 migrações em dia** |
| Navegação dos menus | **63 aprovados: 52 menus internos, 10 da central e redirecionamento legado** |
| Fluxos completos no navegador | **84 verificações únicas aprovadas, incluindo a regressão adicional de transferência de login** |
| Auditoria das dependências de execução | **Frontend sem alertas; backend com exceção A1 abaixo** |
| Backup atual da base real | **Gerado, 6.585.877 bytes, manifesto SHA-256; recuperação comprovada com o backup anterior** |
| Armazenamento real | **Gravação, leitura, comparação e remoção do arquivo de diagnóstico aprovadas** |
| HTTP em execução | **API, frontend e proxy /api: 200; requisições autenticadas existentes também retornando 200** |

A rodada completa teve 63/63 casos de navegação aprovados e 82/83 de fluxos aprovados. A falha restante era a comparação estrita de 38px contra 37,99998px retornados pelo navegador. A precisão foi ajustada sem reduzir o tamanho dos controles, e todos os testes de apresentação foram repetidos com sucesso. A regressão nova de transferência foi executada separadamente e aprovada. O relatório consolidado seleciona o resultado mais recente de cada caso e preserva os relatórios originais.

Os testes de navegador usam `gridone_e2e`, portas 3100/3101 e armazenamento separado. As entregas externas e automações por cron ficam desativadas nesse ambiente. A revisão atual não criou cobranças ou ordens de teste na base real.

Evidências locais, ignoradas pelo Git:

- `runtime-logs/production-unit-completion.json`
- `runtime-logs/production-api-e2e-completion.log`
- `runtime-logs/production-browser-combined.json`
- `runtime-logs/production-final-regressions.json`
- `runtime-logs/production-client-link-regression.json`
- `runtime-logs/production-backup-restore-review.log`
- `runtime-logs/production-live-smoke.json`
- `runtime-logs/production-storage-probe.json`
- `runtime-logs/production-database-network.log`
- `runtime-logs/production-api-e2e.log`
- `runtime-logs/backend-lint-release.json`
- `runtime-logs/frontend-lint-final.json`
- `runtime-logs/production-backend-build-release.log`
- `runtime-logs/production-frontend-build-final.log`
- `runtime-logs/production-frontend-typecheck.log`
- `runtime-logs/production-menus-e2e-results.json`
- `runtime-logs/production-flows-e2e-results.json`
- `runtime-logs/production-browser-release.log`
- `runtime-logs/production-db-preflight.log`
- `runtime-logs/production-migration-status.log`

Backup: `backend/backups/20261013-190922_gridone_db_ea133d3b.dump`, acompanhado do manifesto. SHA-256: `0ff431a3c52154cf21d59f050b725636b863cc882c88d773ff74db08a1174617`. O backup do banco não inclui os anexos da pasta de armazenamento; essa pasta também deve ser copiada.

Backup adicional antes da restrição de rede: `backend/backups/20261014-132418_gridone_db_c51354e3.dump`, 6.585.877 bytes; SHA-256 `f47ea7784c08dcd9f91f87e904246acd595764fe0ccfae77d134261f41a18db9`.

## Segurança e escopo externo

As versões corrigidas foram verificadas no registro npm e nos avisos dos mantenedores: [Next](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j), [Multer](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34), [proxy-addr](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) e [Handlebars](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-p8wg-vrv2-v86f).

A biblioteca `node-forge` 1.4.0 tem um [alerta sem versão corrigida publicada](https://github.com/advisories/GHSA-86w9-cpqp-85rv). No sistema, ela é usada para ler certificados A1; não foram encontradas chamadas à verificação de assinatura RSA atingida pelo aviso. Essa conclusão vem da inspeção do código, não de um certificado de segurança. A1 permanece fora do escopo solicitado. O gate `npm run security:check` registra somente essa exceção exata e reprova outros alertas de execução.

Também permanecem avisos de `braces` e `sprintf-js` nas ferramentas de desenvolvimento/teste, sem patches disponíveis no registro consultado. Não foi aplicado downgrade incompatível do Next/ESLint para tentar apagar esses avisos. Handlebars foi atualizado para 4.7.10. Esses alertas devem ser reavaliados quando os mantenedores publicarem correções.

Não foram homologadas nesta revisão: emissão fiscal na SEFAZ/prefeitura, certificados A1 reais, remessa bancária em banco real, e-mail/WhatsApp por provedor pago e monitoramento por equipamentos externos. O sistema continua permitindo documentos, downloads, links seguros e operação interna sem esses serviços.

## Implantação no Windows

1. Instale Node 22–24, PostgreSQL 15 e LibreOffice. Docker é opcional quando há PostgreSQL próprio.
2. Em um servidor novo, use os exemplos de ambiente para preencher `backend/.env` e `frontend/.env.production.local`. Preserve as configurações existentes em uma atualização.
3. Configure `NODE_ENV=production`, URLs HTTPS, CORS explícito e segredos aleatórios. Configure `FILE_STORAGE_LOCAL_PATH` absoluto, permanente e privado.
4. Use `INTERNAL_API_URL=http://127.0.0.1:3000`. Deixe `NEXT_PUBLIC_API_URL` vazia para o acesso público pela mesma origem. Não copie arquivos locais de desenvolvimento contendo endereço de API local.
5. Gere backup do banco e dos anexos antes de atualizar.
6. Pare a aplicação existente com o script de parada. O instalador deve rodar com o backend parado caso o Windows esteja usando a DLL do Prisma.
7. Execute:

```powershell
.\scripts\install-server.ps1 -RunChecks
# Acrescente -StartDatabase somente se utilizar o PostgreSQL do Compose.
.\scripts\start-server.ps1 -Production
```

8. Configure um proxy HTTPS para `127.0.0.1:3001`. O exemplo `deploy/Caddyfile.example` substitui os cabeçalhos de IP recebidos do navegador, conforme a [documentação do Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Não exponha diretamente as portas do PostgreSQL, Redis ou API.
9. Para supervisão pelo Agendador de Tarefas/serviço, execute `start-server.ps1 -Production -Wait`. Configure reinício em caso de falha e valide uma reinicialização real do servidor. Nenhuma tarefa ou serviço do Windows foi instalado automaticamente nesta revisão.
10. Depois de publicar, confirme login interno/cliente, saúde, leitura/gravação de anexos e PDF no endereço HTTPS.

Para parar:

```powershell
.\scripts\stop-server.ps1
```

Se houver supervisão automática, pare/desative o supervisor antes de parar os processos. O script recusa matar PIDs antigos/reutilizados que não correspondam aos caminhos registrados.

## Repetir a revisão de navegador

```powershell
# Base isolada previamente preparada, nunca a base principal.
.\scripts\start-e2e.ps1 -ProductionBuild
.\scripts\test-e2e.ps1
.\scripts\stop-e2e.ps1
```

A opção `-ProductionBuild` exige um build separado em `.next-e2e`, com `E2E_DIST_DIR=1` e URLs de API/frontend em 3100/3101. Sem essa opção, o script usa desenvolvimento.

O CI usa o mesmo manifesto `scripts/e2e-suite.json`. O job remoto ainda não foi executado porque estas alterações permanecem locais.

## Limites da conclusão

A aprovação dos testes demonstra os caminhos exercitados e os controles verificados. Não significa ausência de qualquer bug, homologação fiscal/bancária, teste de carga ou validação do ambiente público ainda não configurado. O domínio, HTTPS, supervisão após reboot e rotina de backups precisam ser verificados no servidor definitivo.
