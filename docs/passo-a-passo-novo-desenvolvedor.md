# Passo a passo para outra pessoa trabalhar no Manitec GridOne

Este guia mostra como preparar outro computador Windows para desenvolver no projeto, baixar pelo GitHub, rodar o sistema e enviar alteracoes de volta.

## 1. Acesso ao GitHub

Repositorio:

```text
https://github.com/appmanitec-rgb/Grid_One.git
```

Antes de comecar, o responsavel pelo repositorio precisa adicionar a pessoa como colaboradora no GitHub:

1. Abrir o repositorio no GitHub.
2. Entrar em `Settings`.
3. Entrar em `Collaborators` ou `Manage access`.
4. Convidar o usuario GitHub da pessoa.
5. A pessoa precisa aceitar o convite por e-mail ou pelo GitHub.

Nao envie o projeto por arquivo `.zip` para desenvolvimento diario. Use GitHub para todo mundo trabalhar na mesma versao.

## 2. Programas que a pessoa precisa instalar

Instale no outro computador:

- Git
- Node.js 20 ou superior
- Docker Desktop
- Visual Studio Code
- Extensao Prisma no VS Code, opcional

Depois de instalar, reinicie o computador se o Windows pedir.

## 3. Baixar o projeto

Abra o PowerShell na pasta onde quer salvar o projeto e rode:

```powershell
git clone https://github.com/appmanitec-rgb/Grid_One.git
cd Grid_One
code .
```

Se o comando `code .` nao funcionar, abra o VS Code manualmente e selecione a pasta `Grid_One`.

## 4. Configurar o backend

No terminal do VS Code:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Abra o arquivo `backend/.env` e confira estas variaveis:

```env
DATABASE_URL="postgresql://postgres:postgrespw@localhost:5433/gridone_db?schema=public"
DB_USER="postgres"
DB_PASS="postgrespw"
DB_NAME="gridone_db"
EXPECTED_DB_NAME="gridone_db"
JWT_SECRET="troque_esta_chave_no_ambiente_real"
CORS_ORIGINS="http://localhost:3001,http://127.0.0.1:3001"
```

Para desenvolvimento local, pode usar os valores acima. Para producao ou servidor da empresa, use senhas fortes.

## 5. Subir o banco de dados

Ainda dentro da pasta `backend`:

```powershell
docker compose up -d
```

Conferir se os containers subiram:

```powershell
docker ps
```

O banco PostgreSQL fica na porta `5433` do computador local.

## 6. Preparar tabelas e dados

Ainda dentro de `backend`:

```powershell
npx prisma generate
npm run db:migrate
```

Para criar usuarios/dados iniciais de desenvolvimento:

```powershell
npm run seed
```

Se precisar de uma base de demonstracao mais completa:

```powershell
npm run seed:flow
```

## 7. Rodar o backend em desenvolvimento

No terminal `backend`:

```powershell
npm run start:dev
```

Teste:

```powershell
Invoke-WebRequest http://localhost:3000/health -UseBasicParsing
```

Se retornar `200`, o backend esta funcionando.

## 8. Configurar o frontend

Abra um segundo terminal no VS Code:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
```

Confira `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

## 9. Rodar o frontend em desenvolvimento

No terminal `frontend`:

```powershell
npm run dev
```

Abra no navegador:

```text
http://localhost:3001
```

## 10. Como trabalhar sem misturar alteracoes

Antes de comecar qualquer alteracao:

```powershell
git pull
git status
```

Crie uma branch para a tarefa:

```powershell
git checkout -b ajuste-nome-da-tarefa
```

Depois de alterar o codigo, valide:

```powershell
cd backend
npm run build
```

Em outro terminal:

```powershell
cd frontend
npm run build
```

Se tudo passou, salve no Git:

```powershell
git status
git add .
git commit -m "descricao curta da alteracao"
git push -u origin ajuste-nome-da-tarefa
```

Depois abra um Pull Request no GitHub para revisar antes de juntar na branch principal.

## 11. Atualizar o projeto quando outra pessoa mexeu

Na pasta do projeto:

```powershell
git checkout main
git pull
```

Se vierem novas dependencias:

```powershell
cd backend
npm install
npm run db:migrate
```

```powershell
cd ..\frontend
npm install
```

## 12. Rodar em modo de rede interna

Use isto quando quiser que outros computadores da mesma rede acessem o sistema pelo IP do servidor.

Backend:

```powershell
cd "C:\Users\Usuário\Desktop\PROJETO SISTEMA MANITEC\Manitec_GridOne\backend"
npm run build
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "dist/src/main.js" -WindowStyle Hidden
```

Frontend:

```powershell
cd "C:\Users\Usuário\Desktop\PROJETO SISTEMA MANITEC\Manitec_GridOne\frontend"
npm run build
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList ".\node_modules\next\dist\bin\next","start","-H","0.0.0.0","-p","3001" -WindowStyle Hidden
```

Descobrir o IP do servidor:

```powershell
ipconfig
```

Os outros computadores devem abrir:

```text
http://IP_DO_SERVIDOR:3001
```

Exemplo atual:

```text
http://192.168.0.25:3001
```

## 13. Parar os servicos

Ver os processos nas portas:

```powershell
netstat -ano | findstr ":3000"
netstat -ano | findstr ":3001"
```

Parar um processo:

```powershell
taskkill /PID NUMERO_DO_PID /T /F
```

Use PowerShell como Administrador se aparecer `Acesso negado`.

## 14. Problemas comuns

### Porta 3000 ocupada

Existe outro backend rodando. Veja o PID:

```powershell
netstat -ano | findstr ":3000"
```

Depois finalize:

```powershell
taskkill /PID NUMERO_DO_PID /T /F
```

### Porta 3001 ocupada

Existe outro frontend rodando. Veja o PID:

```powershell
netstat -ano | findstr ":3001"
```

Depois finalize:

```powershell
taskkill /PID NUMERO_DO_PID /T /F
```

### Tela branca ou erro de client-side exception

Normalmente acontece quando o Next.js ficou rodando com build antigo. Resolva assim:

```powershell
netstat -ano | findstr ":3001"
taskkill /PID NUMERO_DO_PID /T /F
cd frontend
npm run build
Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList ".\node_modules\next\dist\bin\next","start","-H","0.0.0.0","-p","3001" -WindowStyle Hidden
```

Depois no navegador aperte `Ctrl + F5`.

### Frontend nao acessa backend

Confira:

```powershell
Invoke-WebRequest http://localhost:3000/health -UseBasicParsing
Invoke-WebRequest http://localhost:3001/api/health -UseBasicParsing
```

Se o primeiro falhar, o backend nao esta rodando. Se o segundo falhar, o proxy do frontend nao esta respondendo corretamente.

### Banco nao conecta

Confira:

```powershell
docker ps
```

Se o banco nao estiver ativo:

```powershell
cd backend
docker compose up -d
```

## 15. Regra de ouro

Antes de mexer:

```powershell
git pull
```

Depois de terminar algo funcionando:

```powershell
git add .
git commit -m "descricao da alteracao"
git push
```

Se duas pessoas mexerem no mesmo arquivo ao mesmo tempo, pode dar conflito. Nesse caso, pare e resolva o conflito com calma antes de continuar.
