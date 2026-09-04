# Manitec GridOne

Sistema integrado de operacao, comercial, contratos, ativos, suprimentos, financeiro, pessoas e portal do cliente.

## Servidor

O procedimento oficial para instalar a partir do Git esta em [docs/instalacao-servidor-git.md](docs/instalacao-servidor-git.md).

Diagnostico dos pre-requisitos no Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\server-preflight.ps1
```

Instalacao depois de configurar os arquivos `.env`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-server.ps1 -RunChecks
powershell -ExecutionPolicy Bypass -File .\scripts\start-server.ps1
```

Os arquivos `.env`, banco, documentos, backups e logs de execucao nao devem ser enviados ao Git.

## Desenvolvimento colaborativo

Cada alteracao deve usar uma branch propria e um pull request. A branch `main` deve receber somente codigo revisado e aprovado pela integracao continua.
