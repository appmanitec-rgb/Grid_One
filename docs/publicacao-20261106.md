# Publicação consolidada — 06/11/2026

## Conteúdo preparado

Consolidação das alterações locais de propostas, rascunhos e recuperação,
conjuntos de manutenção, escopos técnicos, documentos comerciais, responsabilidades
por usuário e carteira, padronização de telas, login e navegação lateral.
As regras comerciais sensíveis continuam exigindo atribuição explícita; esta
publicação não concede permissões nem define responsáveis na base principal.

Os builds novos ficam separados dos que atendem o sistema principal. O script de
inicialização aceita um manifesto local de release e usa um cliente Prisma
compatível, sem substituir o cliente que a versão anterior usa. Ver
`deploy-checklist.md` para inicialização e retorno aos artefatos anteriores.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| Compilação backend e inclusão dos modelos documentais | Aprovada, cliente Prisma gerado a partir do schema atual. |
| Compilação frontend Next.js/TypeScript | Aprovada, build separado `.next-release-20261106`. |
| Backend completo — testes unitários | **693 aprovados em 87 suítes**; configuração de teste com banco não operacional, sem migrations ou seeds. |
| Frontend — regressão e testes de navegador | **70 aprovados** em 13 arquivos; inclui menu, permissões, login da equipe/cliente, quatro etapas da proposta em 1366/390 px, rascunhos, conjuntos, conferência e classificação técnica. APIs interceptadas com fixtures. |
| ESLint frontend | **0 erros, 7 avisos**, correspondentes aos avisos preexistentes de imagem, navegação e declarações sem uso. |
| ESLint backend | Varredura completa executada. Os erros se concentraram em seis arquivos; depois de formatados e corrigidas as tipagens dos callbacks de teste e a leitura do iterador do cache, o reteste desses seis arquivos passou sem erros nem avisos. Permanecem seis avisos preexistentes nos arquivos de clientes não alterados nesta correção. |
| Revisão dos arquivos preparados para o Git | Nenhum arquivo de ambiente, artefato operacional privado, chave privada ou token foi encontrado pela varredura específica. Não substitui uma auditoria de segurança completa. |
| Proxy no build novo | `/api/:path*` aponta para `http://127.0.0.1:3000/:path*`. |
| Backup principal | Dump PostgreSQL em formato custom, validado por `pg_restore --list`, com tamanho e SHA-256 registrados no manifesto local. |

Logs completos permanecem em `runtime-logs/publicacao-20261106/`. Documentos
gerados em `output/`, capturas em `docs/evidencias/`, configurações, backups e
artefatos de compilação permanecem locais e estão excluídos do Git.

A formatação dos seis arquivos foi comparada por estrutura sintática antes e
depois, desconsiderando parênteses redundantes e posições no texto: estrutura
preservada. As mudanças além da formatação foram tipar os callbacks dos mocks de
conversão e conferir o resultado do iterador antes de retirar a entrada mais
antiga do cache. A compilação da API foi repetida com sucesso após esses ajustes.

## Serviços e ativação

As interfaces de homologação nas portas 3003/3004 e a API de teste 3006 foram
encerradas. Uma instância temporária 3004 foi usada somente para conferir o build
novo com fixtures e também foi encerrada após os 70 testes.

Verificação final dos listeners do Manitec: interface **3001 em 0.0.0.0** e API
interna **3000 em 127.0.0.1**. A interface principal respondeu HTTP 200. O acesso
do usuário é `http://localhost:3001`; a porta 3000 continua sendo o serviço interno
necessário à aplicação, e não outra interface de usuário.

**A ativação da release nova no principal ainda depende de autorização explícita.**
A revisão automática bloqueou o comando que interromperia os serviços principais
e migraria a base, citando a instrução anterior para não ativar em produção.
Esse comando não foi executado. O principal continua com os artefatos anteriores;
não foram aplicadas migrações, seeds, cópias da base de testes ou alterações de
usuários nesta tarefa.

As três migrações pendentes, revisadas antes da solicitação de autorização, são:

- `20261023190000_proposal_editing_drafts`: rascunhos de edição.
- `20261028180000_commercial_workspace`: snapshots documentais, estimativas,
  modelos e passagem de responsabilidade comercial.
- `20261028190000_commercial_scope_indexes`: índices de consulta.

São aditivas. A ativação preparada prevê novo backup com os serviços parados,
comparação por contagem e hash das tabelas existentes antes/depois, migração,
preflight e inicialização da release na 3001. Os artefatos anteriores permanecem
disponíveis para retorno do código, sem restauração automática do banco.

## Limites mantidos

Os testes de navegador desta publicação usam fixtures e não geram propostas,
cobranças ou mensagens na base principal. Não representam homologação integral de
integrações bancárias/fiscais ou de todos os perfis operacionais. A designação de
responsáveis comerciais reais deve ser conferida na implantação, sem liberar
custos, margens ou visão de equipe por inferência de cargo.
