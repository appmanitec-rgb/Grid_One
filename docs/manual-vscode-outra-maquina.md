# Manual: subir o Grid One em outra maquina pelo VS Code

Este guia foi feito para abrir o projeto em outra maquina Windows usando o VS Code e rodar o backend e o frontend localmente.

## 1. O que instalar antes

- Git
- Node.js 20 ou superior
- VS Code
- Docker Desktop, se quiser subir o PostgreSQL local por container

## 2. Clonar o projeto no VS Code

1. Abra o VS Code.
2. Pressione `Ctrl + Shift + P`.
3. Procure `Git: Clone`.
4. Cole a URL do repositório:

```text
https://github.com/appmanitec-rgb/Grid_One.git
```

5. Escolha a pasta onde o projeto sera salvo.
6. Quando o VS Code perguntar, clique em `Open`.

Se preferir, tambem pode clonar pelo terminal integrado do VS Code:

```powershell
git clone https://github.com/appmanitec-rgb/Grid_One.git
cd Grid_One
code .
```

## 3. Estrutura do projeto

- `backend`: API NestJS + Prisma
- `frontend`: app Next.js
- `docs`: documentacao de apoio

## 4. Configurar o backend

Abra um terminal no VS Code e entre na pasta:

```powershell
cd backend
```

Instale as dependencias:

```powershell
npm install
```

Crie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env
```

### Variaveis minimas do backend

O `.env.example` ja traz a base. Revise pelo menos estas:

- `DATABASE_URL`
- `DB_NAME`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `SEED_ADMIN_PASSWORD`
- `SEED_MASTER_PASSWORD`

Se for usar o `docker-compose.yml` do backend para subir o banco, adicione tambem:

```env
DB_USER=postgres
DB_PASS=postgrespw
```

## 5. Subir o banco de dados

### Opcao A: usando Docker

Ainda dentro de `backend`:

```powershell
docker compose up -d
```

O banco sobe na porta `5433`, que ja bate com o exemplo:

```env
DATABASE_URL="postgresql://postgres:postgrespw@localhost:5433/gridone_db?schema=public"
```

### Opcao B: usando PostgreSQL ja instalado

Se a outra maquina ja tiver PostgreSQL, basta criar o banco e ajustar o `DATABASE_URL` no `backend/.env`.

## 6. Preparar o banco

Ainda em `backend`:

```powershell
npm run db:migrate
```

Se quiser popular o sistema com usuarios e dados iniciais:

```powershell
npm run seed
```

Se quiser uma carga mais completa de fluxo:

```powershell
npm run seed:flow
```

## 7. Rodar o backend

Ainda em `backend`:

```powershell
npm run start:dev
```

API local:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

## 8. Configurar o frontend

Abra um segundo terminal no VS Code e entre na pasta:

```powershell
cd frontend
```

Instale as dependencias:

```powershell
npm install
```

Crie o arquivo de ambiente:

```powershell
Copy-Item .env.example .env.local
```

O valor padrao ja aponta para a API local:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## 9. Rodar o frontend

Ainda em `frontend`:

```powershell
npm run dev
```

Frontend local:

```text
http://localhost:3001
```

## 10. Ordem recomendada no VS Code

Use tres terminais:

1. `backend`: para `npm run start:dev`
2. `frontend`: para `npm run dev`
3. opcional `backend`: para `npm run seed` ou comandos de banco

## 11. Como atualizar na outra maquina depois

Quando ja tiver clonado e quiser trazer alteracoes novas:

```powershell
git pull
```

Se vier mudanca no backend:

```powershell
cd backend
npm install
npm run db:migrate
```

Se vier mudanca no frontend:

```powershell
cd frontend
npm install
```

## 12. Comandos uteis

Backend:

```powershell
npm run build
npm run lint
npm run db:preflight
```

Frontend:

```powershell
npm run build
npm run lint
```

## 13. Problemas comuns

### Porta 3000 ocupada

Feche o processo antigo ou troque temporariamente a porta do backend.

### Porta 3001 ocupada

Feche o processo antigo ou ajuste a execucao do Next localmente.

### Erro de banco

Confira:

- se o Docker subiu
- se o PostgreSQL esta ativo
- se o `DATABASE_URL` esta correto
- se `npm run db:migrate` rodou sem erro

### Frontend nao conversa com a API

Confira:

- se o backend esta rodando em `http://localhost:3000`
- se o `frontend/.env.local` esta com `NEXT_PUBLIC_API_URL=http://localhost:3000`

## 14. Fluxo mais rapido de primeira subida

No VS Code:

```powershell
git clone https://github.com/appmanitec-rgb/Grid_One.git
cd Grid_One
code .
```

Terminal 1:

```powershell
cd backend
npm install
Copy-Item .env.example .env
docker compose up -d
npm run db:migrate
npm run seed
npm run start:dev
```

Terminal 2:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Depois abra:

- `http://localhost:3001`
- `http://localhost:3000/health`
