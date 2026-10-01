# Cobrança Santander CNAB 240

Fluxo disponível em **Financeiro → Cobrança Santander**.

1. Cadastre a conta em **Contas Bancárias** e configure o convênio com o código de transmissão, carteira, agência, conta e dados do beneficiário informados pelo Santander.
2. Crie ou confirme os títulos em **Contas a Receber**. O cliente precisa ter CPF/CNPJ e endereço de cobrança completos.
3. Prepare os boletos e, quando houver NF emitida no sistema fiscal, vincule número, data, chave e link da nota.
4. Selecione os boletos e gere a remessa `.REM`. O arquivo fica disponível para novo download no histórico. Envie-o pelo canal contratado com o Santander e marque o lote como enviado.
5. Importe o retorno CNAB 240 da mesma conta. O sistema registra confirmação, rejeição e liquidação; arquivos idênticos não são processados duas vezes. Ocorrências sem correspondência, repetidas ou com valor líquido bancário diferente do valor pago vão para revisão.
6. Confira o extrato e a conciliação bancária, especialmente tarifas e eventos de baixa ou Pix.

O gerador implementa a entrada de títulos com segmentos P/Q, e o importador interpreta os segmentos T/U do [layout H7815 v8.5 do Santander](https://cms.santander.com.br/sites/WPS/documentos/arq-layout-de-arquivos-download-cob240ptbr/26-02-25_131410_h7815_layout_cobran%C3%A7a_cnab_240_posi%C3%A7%C3%B5es_padr%C3%A3o_santander_multibanco_fev_2026_v.8.5_(portugu%C3%AAs).pdf). Para começar a operar, valide um arquivo no **Teste de Arquivos** do internet banking e confirme os parâmetros específicos do convênio com o banco. Marcar “homologado” no sistema é um registro desse resultado, não uma validação automática pelo Santander.

O sistema registra a **referência da NF** emitida externamente. A emissão fiscal automática depende da integração com o emissor fiscal usado pela empresa. A remessa registra o boleto no banco; não produz, por si só, um PDF de boleto ou linha digitável. Esses dados precisam vir do retorno ou de uma integração bancária específica antes de serem enviados ao cliente.
