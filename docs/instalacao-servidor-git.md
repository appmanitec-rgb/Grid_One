# Instalacao do GridOne no servidor pelo Git

## Versoes homologadas

| Software | Versao recomendada | Observacao |
| --- | --- | --- |
| Git | 2.45 ou superior | Clone, pull e historico do codigo |
| Node.js | 22 LTS | CI e arquivos `.nvmrc` usam Node 22 |
| npm | 10 ou superior | Usar `npm ci` com os lockfiles |
| PostgreSQL | 15.x | O compose usa `postgres:15-alpine` |
| Docker | Engine 27+ ou Desktop 4.34+ | Opcional se houver PostgreSQL externo |
| Docker Compose | v2.29+ | O comando correto e `docker compose` |
| LibreOffice | 24.2 ou superior | Obrigatorio para conversao DOCX para PDF |
| PowerShell | 5.1 ou 7+ | Scripts de instalacao para Windows |

Node 22 e a versao padrao do projeto. Os pacotes aceitam Node 22, 23 e 24, mas todos os servidores e desenvolvedores devem preferir a mesma versao 22 para reduzir diferencas.

No Windows 10/11, o PostgreSQL do compose pode usar Docker Desktop com containers Linux. No Ubuntu Server, use Docker Engine. No Windows Server, prefira PostgreSQL 15 instalado como servico ou hospedado em outro servidor; Docker Desktop nao deve ser tratado como solucao de producao nesse sistema operacional.

## Antes de instalar

Defina:

- IP fixo ou DNS do servidor;
- banco PostgreSQL e senha forte;
- conta administrativa inicial;
- pasta permanente para documentos;
- rotina de backup do banco e dos documentos;
- acesso somente por rede interna/VPN ou por HTTPS;
- conta de servico que executara o GridOne.

Nunca envie `.env`, senhas, backups ou documentos para o Git.

## Primeira instalacao no Windows Server

```powershell
git clone https://github.com/appmanitec-rgb/Grid_One.git
cd Grid_One
git checkout main
powershell -ExecutionPolicy Bypass -File .\scripts\server-preflight.ps1
```

Acrescente `-RequireDocker` somente quando o host suportar containers Linux e o banco for iniciado pelo compose do projeto.

Crie as configuracoes iniciais:

```powershell
Copy-Item .\backend\.env.production.example .\backend\.env
Copy-Item .\frontend\.env.production.example .\frontend\.env.production.local
```

Edite `backend\.env`. Troque todos os valores `REPLACE_*`, configure `DATABASE_URL`, `DB_NAME`, URLs, storage e LibreOffice. O frontend ja vem preparado para encaminhar `/api` internamente para `127.0.0.1:3000`.

Instale banco, dependencias, migrations e builds:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-server.ps1 -StartDatabase -RunChecks
```

Sem Docker local:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-server.ps1 -RunChecks
```

Inicie e valide:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-server.ps1
Invoke-WebRequest http://127.0.0.1:3000/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing
```

Os usuarios acessam `http://IP_DO_SERVIDOR:3001`. Em producao, prefira um DNS interno e HTTPS por proxy reverso.

## Atualizacoes pelo Git

O servidor deve executar somente uma branch aprovada, normalmente `main`. Nao edite arquivos de codigo diretamente nele.

```powershell
git status --short
git pull --ff-only origin main
powershell -ExecutionPolicy Bypass -File .\scripts\install-server.ps1 -RunChecks
```

Antes de migrations, faca backup com `backend\npm run db:backup`. Depois da atualizacao, reinicie os servicos e valide `/health`, login, proposta, PDF e upload.

## Trabalho das tres pessoas

Cada pessoa usa seu computador e uma branch propria. O servidor recebe apenas alteracoes revisadas:

```text
feature/tarefa -> pull request -> main -> servidor
```

Proteja `main` no GitHub exigindo pull request e CI aprovado. Conceda a chave de deploy do servidor somente com leitura do repositorio.

## Inicializacao automatica

Em Windows Server, o tecnico deve registrar backend e frontend como servicos usando uma conta sem privilegio administrativo. Pode usar NSSM, WinSW ou Agendador de Tarefas. Os comandos dos servicos sao:

```text
Backend:  node dist/src/main.js       (diretorio backend)
Frontend: node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3001
```

Configure reinicio automatico, logs, dependencia do PostgreSQL e inicializacao apos o boot. Nao use janelas abertas do PowerShell como operacao permanente.

## Portas

- `3001`: frontend; liberar para a rede interna ou esconder atras de `80/443`.
- `3000`: backend; manter local quando o proxy `/api` for usado.
- `5433`: PostgreSQL do compose; nao liberar para usuarios nem para a internet.
- `6379`: Redis opcional; nao liberar externamente.

## Dados que nao podem ser perdidos

- banco PostgreSQL;
- pasta definida por `FILE_STORAGE_LOCAL_PATH`, quando storage local;
- templates institucionais versionados no Git;
- `.env` guardado no servidor/gerenciador de segredos;
- certificados do proxy, quando houver HTTPS.
