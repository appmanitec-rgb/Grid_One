# Auditoria de fluxo completo — 2 de outubro de 2026

## Ambiente e proteção dos dados

A auditoria usa uma cópia do banco operacional chamada `gridone_flow_qa_20261001` e uma API local na porta 3100. O script `backend/scripts/audit-commercial-flow.js` recusa qualquer outro nome de banco ou endereço de API. Foram usados 12 clientes existentes, com geradores e itens base reais. Tarifas, perfis PIX, almoxarifado, emitentes fiscais, conta bancária e convênio Santander de teste foram criados **somente na cópia**, com nomes que indicam que não podem ser usados para pagamento, emissão ou envio.

A base operacional permaneceu com **0 propostas, 0 oportunidades e 0 contas a receber** após os testes. Nela há **0 tarifas por hora, 0 perfis de pagamento, 0 emitentes com CNPJ e 0 convênios de cobrança** cadastrados.

## Matriz de 12 clientes

| Caso | Cliente | Cobertura | Resultado |
| --- | --- | --- | --- |
| 01 | Cliente 01 | Peça vinculada ao gerador | Lacuna: sem entrega e cobrança ligadas à proposta |
| 02 | Cliente 02 | Peça avulsa | Lacuna: sem entrega e cobrança ligadas à proposta |
| 03 | Cliente 03 | Serviço do catálogo, OS, execução, cobrança e baixa | Passou |
| 04 | Cliente 04 | Hora de técnico júnior, OS, cobrança e baixa | Passou |
| 05 | Cliente 05 | Peça da máquina e horas, aceite no portal, estoque, OS, cobrança e baixa | Passou |
| 06 | Cliente 06 | Contrato, parcelas a receber, geração e execução de preventiva, baixa e remessa de teste | Passou nas etapas simuladas |
| 07 | Cliente 07 | Peça da máquina com desconto | Lacuna: sem entrega e cobrança ligadas à proposta |
| 08 | Cliente 08 | Peça avulsa em múltiplas unidades | Lacuna: sem entrega e cobrança ligadas à proposta |
| 09 | Cliente 09 | Serviço do catálogo e hora técnica | Passou |
| 10 | Cliente 10 | Hora de assistente | Passou |
| 11 | Cliente 11 | Peça avulsa e serviço, reserva e baixa de estoque | Passou |
| 12 | Cliente 12 | Múltiplas peças da máquina | Lacuna: sem entrega e cobrança ligadas à proposta |

Em todos os 12 casos foram conferidos criação da oportunidade, vínculo correto com cliente e gerador, proposta, soma dos itens, submissão à diretoria, aprovação, estágio ganho e histórico. A tarifa de hora enviada deliberadamente como R$ 1 foi substituída pela tarifa configurada no Studio (R$ 100/R$ 150 no teste). Os casos de serviço seguiram por OS concluída, título sem duplicidade e baixa bancária simulada. Os casos mistos exigiram entrada e reserva de estoque antes da conclusão da OS.

## Checagens adicionais

- Contrato: a baixa de uma parcela atualizou a fatura correspondente, e uma segunda baixa integral foi recusada.
- Fiscal: rascunhos de NFS-e e NF-e foram criados com dois emitentes **fictícios** distintos. O checklist continuou apontando enquadramento tributário e integração fiscal pendentes. Nenhuma nota foi emitida.
- Santander: um título gerou remessa de teste com registros de 240 posições. O sistema recusou marcar como enviada a remessa de convênio não homologado. Nenhum arquivo foi transmitido ao banco.
- Integridade: uma proposta com cliente de um cadastro e gerador de outro foi recusada.
- Aprovações: o aceite no portal gerou OS; o aceite assinado por link também foi corrigido e coberto por teste. A repetição do aceite foi recusada, sem criar outra OS.
- Regressão: 103 testes de 12 suítes dos módulos comercial, portal, entregas, contratos, operações, estoque e financeiro passaram. O build do backend e o lint dos arquivos alterados também passaram.

## Correções aplicadas

1. A criação da OS de serviço agora ocorre na mesma transação da aprovação da proposta pelos três caminhos: ação interna, portal do cliente e link assinado. Uma falha na criação da OS impede que a proposta fique indevidamente como ganha.
2. As peças de propostas mistas passam para os materiais da OS. A equipe operacional ainda precisa indicar almoxarifado e reservar o estoque antes de concluir o serviço.
3. A atualização para “ganha” exige que a proposta ainda esteja em análise do cliente, reduzindo o risco de dois aceites concorrentes criarem ordens duplicadas.
4. Remessas de convênio Santander não homologado podem ser geradas para conferência, mas não podem ser marcadas como enviadas.

## Lacunas identificadas na auditoria

Atualização após a auditoria: as lacunas 1 e 2 foram tratadas. Propostas só de peças agora geram pedido de venda com reserva, entrega e título vinculado. A OS criada por proposta de serviço agora mantém vínculo com ela; ao concluir a execução, títulos com valor e vencimento definidos são gerados automaticamente. Propostas sem vencimento ou com entrada exigem revisão do financeiro. As lacunas 3 a 5 continuam pendentes.

1. **Venda só de peças:** não existe uma ordem de separação/entrega ligada à proposta, nem geração de conta a receber com referência à proposta. O rascunho de NF-e de teste usou um título manual, cuja descrição cita a proposta, mas não há vínculo no banco. Os cinco casos de peças ficam abertos.
2. **Faturamento de serviços avulsos:** o título é criado manualmente a partir da OS e o valor é digitado novamente. O teste usou o total correto, mas o sistema não o impõe nem liga a OS à proposta por chave de banco.
3. **Emissão fiscal real:** o módulo atual prepara rascunhos, e a própria API informa `issuanceConfigured: false`. Não há transmissão, autorização ou cancelamento de NF-e/NFS-e. Os dois CNPJs reais precisam ser cadastrados com dados tributários antes de homologação.
4. **Banco real:** não há convênio Santander configurado na base operacional; a remessa testada usa dados fictícios e não prova aceite ou liquidação pelo banco. O parser de retorno possui testes unitários, mas falta retorno real de homologação.
5. **Interface:** o navegador compartilhado não estava disponível nesta sessão. A validação executada foi de API e banco, sem inspeção de telas.

## Reprodução

Com a cópia PostgreSQL e a API 3100 já preparadas, defina `DATABASE_URL` apontando para `gridone_flow_qa_*`, `FLOW_QA_PASSWORD` para as contas de demonstração e, opcionalmente, `FLOW_QA_REPORT_FILE` para o JSON. Execute `node backend/scripts/audit-commercial-flow.js --inspect` para conferir a base e `node backend/scripts/audit-commercial-flow.js --prepare` para a matriz. O script retorna código 1 enquanto houver casos marcados como lacuna ou falha. **Nunca execute as etapas de preparação na base operacional.**
