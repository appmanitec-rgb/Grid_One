# Fiscal e cobrança Santander: preparação para uso real

## Conferência dos arquivos operacionais (outubro de 2026)

- Os dois documentos de orientação de pagamento da pasta compartilhada separam recebimentos de **serviços** para Manitec Services Geradores Ltda e de **peças** para Manitec Energia Equipamentos Ltda. Ambos trazem contas e chaves PIX distintas. Conferir esses dados com o financeiro antes de cadastrá-los: arquivos de orientação não substituem confirmação bancária atual.
- O Studio permite associar cada perfil de pagamento a uma empresa emitente. Ao ativar um perfil, o CNPJ do favorecido deve ser igual ao CNPJ da empresa escolhida. Nenhum dado bancário desses documentos foi importado automaticamente.
- As primeiras páginas dos PDFs de notas de janeiro mostram NF-e **recebidas** pela Manitec como destinatária. Os CNPJs destinatários coincidem com os CNPJs dos documentos de pagamento. Essas notas não comprovam regime tributário, parâmetros de emissão nem dados do convênio de cobrança.
- Os documentos não contêm código de transmissão, carteira e comprovante de homologação de remessa/retorno Santander. O responsável informou que há um certificado A1 para cada CNPJ; ainda falta conferir titularidade, validade, senha e instalação segura no servidor antes da homologação fiscal.

## Situação implementada

- Rascunhos de NF-e e NFS-e são separados por CNPJ emitente e exibem pendências por empresa. Um rascunho não tem valor fiscal.
- O convênio CNAB 240 H7815 v8.5 é vinculado ao CNPJ beneficiário. A remessa impede mistura com nota autorizada por outra empresa.
- A validação do arquivo no Santander exige referência do resultado aprovado e identificação da remessa testada. O sistema registra responsável, data e hash da remessa. Essa informação é declarada pelo operador; não substitui a resposta do banco.
- O importador de retorno exige beneficiário, conta, sequência, totais de lote e pares T/U consistentes. Rejeições e divergências ficam para revisão.
- A prévia do retorno lê o arquivo e mostra boletos vinculados, valores e ocorrências para revisar sem gravar baixas financeiras. A importação pela tela só é liberada depois dessa conferência.

## Para habilitar os dois CNPJs

1. Cadastrar as duas empresas em **Configurações da empresa** com razão social, CNPJ, endereço fiscal, CEP, regime tributário e inscrições estadual/municipal pertinentes.
2. Para cada CNPJ, obter certificado A1 e acessos de homologação e produção. Instalar o certificado em armazenamento seguro do servidor; não enviá-lo por chat, Git ou campos de texto da aplicação.
3. Com a contabilidade, parametrizar tributação por operação, produto/serviço e emitente. NCM, CFOP e código de serviço sozinhos não definem os tributos nem tornam uma nota apta para emissão.
4. Implementar e validar as integrações de autorização, consulta e cancelamento de NF-e na SEFAZ e de DPS/NFS-e no Emissor Nacional para cada empresa. Guardar XML, protocolo, chave/identificador, resposta e eventos de cancelamento; tratar envio repetido e resposta incerta sem duplicar documentos.
5. Executar homologação de emissão, consulta e cancelamento nos ambientes oficiais para **cada** CNPJ, com notas de teste conferidas pela contabilidade, antes de liberar produção.

## Para validar a cobrança Santander

1. Cadastrar a conta Santander e o convênio correspondente ao CNPJ beneficiário, com código de transmissão, agência, conta e carteira fornecidos pelo banco.
2. Gerar uma remessa de teste e baixá-la. Enviá-la em **Internet Banking PJ → Cobrança e Recebimentos → Teste de Arquivos**, conforme manual H7815. Corrigir qualquer rejeição. Registrar na aplicação a remessa e a referência do teste aprovado.
3. Enviar uma remessa operacional somente após a aceitação do teste e confirmação dos títulos, valores, vencimentos e pagadores. A marcação “enviada” na aplicação é um registro manual; o banco confirma o registro no retorno.
4. Conferir a prévia e importar um **retorno real** da mesma conta. Conferir entrada confirmada, rejeição, liquidação e totais contra extrato bancário. Divergências ficam pendentes de revisão e não devem ser tratadas como pagamento confirmado.
5. Repetir as verificações para cada conta/CNPJ utilizado em cobrança.

## Fontes técnicas oficiais

- Santander, [Layout Cobrança CNAB 240 H7815 v8.5](https://cms.santander.com.br/sites/WPS/documentos/arq-layout-de-arquivos-download-cob240ptbr/26-02-25_131410_h7815_layout_cobran%C3%A7a_cnab_240_posi%C3%A7%C3%B5es_padr%C3%A3o_santander_multibanco_fev_2026_v.8.5_%28portugu%C3%AAs%29.pdf).
- NFS-e Nacional, [documentação técnica atual](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual) e [ambientes de APIs](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao).
- Portal NF-e, [Manual de Orientação ao Contribuinte (MOC 7.0)](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=LrBx7WT9PuA%3D).
