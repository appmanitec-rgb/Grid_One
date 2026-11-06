# Proposta Manitec v6

Preserva capa, cabeçalho e rodapé institucionais da v5. Acrescenta os quadros
de pagamento de serviços e peças nas condições comerciais e assinatura final
com assinatura, nome e data em linhas separadas e espaçadas.

Construção: `backend/scripts/build-proposal-template-v6.py`. Dados bancários
seguem exclusivamente o snapshot da conta selecionada, cadastrada no Studio
em Dados > Contas para Propostas. Não existem contas bancárias de reserva no
gerador. Campos ausentes aparecem como “A definir”. Alterações no cadastro
entram em novas propostas ou ao salvar novamente a seleção de um rascunho;
documentos emitidos conservam os dados aprovados e exigem uma revisão.
Valores por categoria são os itens líquidos. Despesas e desconto geral seguem
o resumo e não recebem uma distribuição fiscal inventada. Entrada e saldo
seguem os valores cadastrados; não se criam vencimentos.

Nenhuma regra de aprovação, recebíveis ou confirmação financeira foi alterada.
As versões anteriores e documentos aprovados permanecem preservados.
