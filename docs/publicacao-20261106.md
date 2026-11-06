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
| Conferência após ativação | **26 testes aprovados** na interface 3001, usando fixtures; oito verificações HTTP reais aprovadas, leitura dos cinco modelos novos pelo cliente Prisma e nenhuma migração pendente ou com falha. |

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

**Release ativada no principal em 06/11/2026, após autorização explícita do usuário
para integrar o PR #1, atualizar a base e ativar na porta 3001.** O PR foi integrado
à `main` pelo commit `47b0dd4e4dd34a33b900e915a27f19ce6588001e`. A árvore desse commit
foi comparada à do código testado `c1c7ffaadc2bf0cb2c2309ad99df74bd29dc0632`: conteúdos
idênticos. A restrição anterior de ativação foi resolvida por essa autorização.

As três migrações autorizadas foram aplicadas com sucesso:

- `20261023190000_proposal_editing_drafts`: rascunhos de edição.
- `20261028180000_commercial_workspace`: snapshots documentais, estimativas,
  modelos e passagem de responsabilidade comercial.
- `20261028190000_commercial_scope_indexes`: índices de consulta.

Com os serviços principais parados, foi gerado e verificado um novo backup de
6.704.173 bytes, com SHA-256 no manifesto privado. A coleta anterior à migração
ocorreu às 15:40:52 e a posterior às 15:41:27, horário de São Paulo.

A comparação por contagem e hash confirmou **154 tabelas de dados existentes
integralmente preservadas**, incluindo usuários, permissões, propostas e documentos.
A tabela de histórico `_prisma_migrations` recebeu os registros das migrações.
Foram criadas cinco tabelas: `proposal_editing_drafts`, `proposal_document_snapshots`,
`commercial_proposal_estimates`, `commercial_content_templates` e
`commercial_handoff_tasks`. Não houve cópia da base de testes, seed ou atribuição
de permissões aos usuários reais.

O preflight foi aprovado. API e interface responderam HTTP 200 após o reinício,
com a release `.next-release-20261106` / `dist-release-20261106` e seu cliente Prisma
separado. O smoke real confirmou banco e storage configurados em produção,
proteção dos endpoints comerciais com HTTP 401 para requisições sem autenticação,
leitura das novas estruturas e zero migrações pendentes ou com falha.

Os 26 testes posteriores percorreram menu, permissões, login da equipe e cliente,
responsividade e recuperação da proposta na 3001, com APIs interceptadas. Não
criaram registros comerciais no principal. Os logs operacionais também registraram
consultas autenticadas bem-sucedidas após a troca; esse uso corrente do principal
não faz parte da comparação de integridade feita com os serviços parados.

O proxy registrou recusas de conexão durante a inicialização da API, na janela
de interrupção autorizada. Não houve novas entradas nesse log após 15:41:57 na
conferência seguinte; os checks de saúde e a navegação posteriores passaram. O
stderr do backend permaneceu vazio nessa rodada. Isso não equivale a resolver os
erros transitórios de proxy mencionados nos relatórios anteriores.

Os artefatos anteriores permanecem disponíveis para retorno do código, sem
restauração automática do banco. Configuração da release e PIDs ativos ficam em
`runtime-logs/active-release.json` e `runtime-logs/server-pids.json`.

## Limites mantidos

Os testes de navegador desta publicação usam fixtures e não geram propostas,
cobranças ou mensagens na base principal. Não representam homologação integral de
integrações bancárias/fiscais ou de todos os perfis operacionais. A designação de
responsáveis comerciais reais deve ser conferida na implantação, sem liberar
custos, margens ou visão de equipe por inferência de cargo.
