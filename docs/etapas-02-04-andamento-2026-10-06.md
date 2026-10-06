# Etapas 02 a 04: estado verificavel em 06/10/2026

## Etapa 02 - homologacao de ambiente

O ensaio anterior comprovou bootstrap, backup e restore em PostgreSQL local isolado (`docs/staging-backup-restore-report.md`). Nesta rodada, outro PostgreSQL descartavel (`gridone_stage_returns`, porta 5546) recebeu o esquema e executou o teste de devolucao com dados ficticios. Nenhum cliente operacional foi copiado.

Antes de atualizar o banco operacional, foi gerado e validado o backup local ignorado pelo Git `backend/backups/20261006-133807_gridone_db_08769454.dump` (6.542.065 bytes, SHA-256 `dd3ac1664f977e2975eea7c7710fa7f09195125801a1d240adfba29bb305bc97`). A migration `20261006133000_sales_delivery_returns` foi aplicada no banco local `gridone_db`; o preflight confirmou 98 migrations. Esse backup local nao substitui o destino externo exigido pela etapa 02.

O responsavel pediu para adiar por ora a infraestrutura externa/AWS. Portanto **a etapa 02 nao esta homologada**: faltam URLs HTTPS de staging, banco e armazenamento externos exclusivos, probe de storage real, upload/download/PDF/link/revogacao, backup e restore externos, logs, alertas e ensaio de rollback. O container local nao substitui essas provas.

## Etapa 03 - ciclo comercial, operacao e financeiro

O ensaio anterior de 12 clientes e a reconciliacao estao em `docs/etapa-03-fluxo-crm-operacao-financeiro-2026-10-06.md`. A lacuna de devolucao de pecas ja entregues recebeu implementacao e teste de integracao local nesta rodada: `backend/scripts/verify-sales-return.cjs` passou devolucao parcial, repeticao idempotente, bloqueio de titulo com pagamento, devolucao integral, estoque e conta a receber. A API exige confirmacao expressa de que a peca foi conferida e esta apta a voltar ao estoque; a confirmacao fica no log de auditoria.

A etapa ainda nao tem aceite integral sem repetir a matriz no staging separado e sem definir triagem de pecas devolvidas danificadas e regularizacao de cobrancas/notas ja emitidas. A recepcao atual recoloca a peca no estoque do almoxarifado de origem; o operador deve usá-la somente para pecas aptas a voltar ao estoque.

## Etapa 04 - fiscal dos dois CNPJs

O banco operacional foi consultado somente para diagnostico, sem gravacao: ha um cadastro de empresa padrao sem razao social/CNPJ/endereco fiscal/regime, nenhum A1 instalado e nenhum perfil de pagamento. A chave de criptografia fiscal do servidor existe. A tela de certificados e a area de rascunhos existem, mas `issuanceConfigured` continua `false` e nao ha autorizacao, consulta nem cancelamento real no codigo. O responsavel pediu para adiar a instalacao dos A1 por enquanto. **Nao houve transmissao nem homologacao fiscal.**

Fontes oficiais verificadas nesta rodada:

- A Prefeitura de Indaiatuba informa uso obrigatorio do Emissor Nacional NFS-e a partir de 01/01/2026: https://www.indaiatuba.sp.gov.br/comunicacao/imprensa/noticias/34847/indaiatuba-avanca-na-implantacao-da-nota-fiscal-de-servicos-eletronica-nacional-%28nfs-e%29 . O antigo DEISS informa que deixou de emitir/importar RPS nessa data: https://deiss.indaiatuba.sp.gov.br/Deiss/publico/login.jsf .
- Ambientes e documentacao atual da API NFS-e: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao/apis-prod-restrita-e-producao e https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual .
- URLs NF-e 4.00 de homologacao e producao em SP: https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/URL-WEBSERVICES.aspx .
- A Receita Federal ja emite CNPJ alfanumerico desde julho de 2026; campos que removem letras do CNPJ no cadastro/fiscal/certificados precisam ser adaptados antes de aceitar emitentes ou destinatarios nesse formato: https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico .

Sequencia para a proxima rodada fiscal: cadastrar os dois emitentes com dados conferidos pela contabilidade; obter tabela de tributacao por operacao/produto/servico, serie e numeracao; adaptar validacao de identificadores fiscais ao CNPJ alfanumerico; implementar assinatura e transporte por tipo, estado de submissao idempotente, consulta apos resposta incerta, armazenamento de XML/protocolo/eventos e cancelamento. Depois instalar os dois A1 por localhost/HTTPS e executar emissao, consulta e cancelamento em homologacao oficial para cada CNPJ e tipo. Liberacao em producao depende dessas provas e do aceite contabil.

A etapa 05 do Santander permanece adiada conforme orientacao do responsavel.
