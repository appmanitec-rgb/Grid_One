# Proposta comercial Manitec v4 — identidade e conteúdo recuperados

30/10/2026. Revisão do padrão a partir do pedido e do PDF original `proposta-manitec-modelo-v2-previa.pdf`, preservando a versão reformulada v3. Resultado destinado à revisão no ambiente isolado; sem envio externo, commit, push, migração ou ativação em produção.

## Apresentação e sequência

A abertura comercial recupera a presença da Manitec com a logo oficial proporcional, título em destaque, número e total. Azul institucional, texto branco nas sete faixas principais, pequenos detalhes vermelhos e fundo branco. Não há uma página exclusivamente decorativa.

Sequência: identificação das partes; equipamento e objetivo; peças; serviços; resumo do investimento e condições comerciais; escopo e exclusões; condições gerais. As condições gerais começam em nova página. O conteúdo não foi comprimido para impor uma quantidade de páginas.

As tabelas têm códigos em coluna própria, quantidades, unidades, preços, descontos e totais. Cabeçalhos de categoria se repetem na continuação; linhas não se dividem. A inspeção do cenário extenso identificou um subtotal isolado: a última linha agora fica junto ao subtotal. Etapas do escopo permanecem inteiras. Aceite e campos de assinatura ficam ao final.

## Comparação com a referência

| Informação do original | Situação na v3 | Tratamento na v4 |
| --- | --- | --- |
| Marca e abertura | Cabeçalho compacto, sem a capa original | Logo ampliada na abertura comercial, título, número, total e cabeçalho compacto nas páginas seguintes. |
| Identificação completa das partes | Resumo comercial compacto | Blocos lado a lado, razão social, CPF/CNPJ, endereço, consultor, contato, código do cliente, telefone e e-mail disponíveis. |
| Fabricante, motor e horímetro | Resumo do equipamento reduzido | Campos recuperados, junto a equipamento, potência e série. |
| CNPJs de faturamento | Dados de recebimento | Permanecem na seção de faturamento; não substituem a razão social da contratada. |
| Local e responsável pela entrega/atendimento | Não explicitados | Recuperados junto às condições comerciais, usando endereço e contato cadastrados do exemplo. |
| Ferramental, relatório e orientação ao operador | Responsabilidades resumidas | Compromissos recuperados e separados das obrigações do cliente. |
| Acesso, preposto, assinatura de conclusão, limpeza e controle de terceiros | Resumo genérico | Obrigações explícitas em bloco próprio; controle de pessoas não autorizadas pela Manitec preservado. |
| Obra, CREA, engenharia e normas de instalação | Retirados do padrão de manutenção | Não se aplicam automaticamente à manutenção TOF; instalação recebe texto condicionado ao escopo e decisão técnica separada. |
| Substituição em 48 horas | Removida conforme solicitação anterior | Continua removida; previsão depende de disponibilidade, fornecedor, aprovação e agendamento, com comunicação de mudanças. |
| Atraso e cancelamento | Percentuais preservados com comentários editoriais | Percentuais preservados, comentários retirados do corpo comercial e questões não resolvidas registradas separadamente. A multa sobre serviço não foi estendida a venda só de peças. |
| Garantia | Pendência expressa no corpo | Seção omitida quando não há condição explicitamente confirmada; nenhuma garantia criada. |
| Observações externas e exclusões | Escopo e condições | Preservadas; exclusões essenciais também aparecem antes das cláusulas gerais. Observações internas não são impressas. |

Total preservado: **R$ 910,00** de peças líquidas + **R$ 360,00** de serviços líquidos + **R$ 100,00** de deslocamento − **R$ 50,00** de desconto geral = **R$ 1.320,00**. Os descontos por item já estão nos subtotais; não são aplicados novamente. Itens, preços, quantidades, unidades, emissão e validade do exemplo mantidos.

As pendências estão em [proposta-v4-pendencias-internas.md](proposta-v4-pendencias-internas.md), fora do documento do cliente.

## Implementação reutilizável

- Novo padrão institucional de proposta: `backend/src/templates/documents/proposal/manitec-default-v4/`.
- Construção reproduzível: `backend/scripts/build-proposal-template-v4.py`, usando a logo existente em `frontend/public/brand/manitec-logo-transparent.png`.
- Contexto de apresentação: `proposal-branded-layout.ts`, integrado ao contexto institucional. Cálculos e registros comerciais continuam nos serviços existentes.
- Tabelas Word nativas e blocos de obrigações no renderizador; campos e tabelas reconhecidos pelo editor do Studio.
- V1, v2 e v3 permanecem disponíveis explicitamente. Outros tipos de documentos mantêm os padrões anteriores. Modelos personalizados publicados no Studio continuam tendo prioridade; não foram republicados.
- Documentos aprovados continuam servidos a partir de seus snapshots. O trabalho não altera aprovação, recebíveis, carteiras, permissões ou condições gravadas.

## Verificação final

| Verificação | Resultado |
| --- | --- |
| Compilação TypeScript do backend isolado | Passou |
| Regressão de propostas, CRM, pagamentos, liberação financeira, acesso, documentos/Studio, catálogo, escopos, clientes, equipamentos, portal e entregas | **327 testes passaram, 40 suítes, zero falhas** |
| ESLint dos nove arquivos de código/testes revisados, com zero avisos permitidos | Passou, zero erros/avisos |
| Exemplo original com três itens | **3 páginas**, R$ 1.320,00; cadastro completo e valores preservados |
| Caso extenso | **7 páginas**, 36 itens e 14 etapas, R$ 15.290,00; códigos aparecem uma única vez, total inteiro na mesma linha, subtotais junto ao último item |
| Dados opcionais ausentes | **3 páginas**, ausências curtas e identificação como prévia, sem datas/garantias inventadas |
| Razões sociais, endereço e nome de equipamento extensos | **3 páginas**, textos completos, sem cortes nos blocos de identificação |
| Word final | XML e pacote válidos; renderizado pelo `render_docx.py`, três páginas conferidas visualmente |
| PDF final | Gerado a partir do Word final pelo serviço do produto; páginas rasterizadas e conferidas |
| Campos internos e editoriais | Sem observações internas, marcadores pendentes, promessa de 48 horas ou comentários de revisão no corpo comercial |
| Dados de faturamento | CNPJs de peças/serviços distintos mantidos na seção própria; distribuição de parcelas não presumida |
| Acesso pela API isolada | Rascunho não disponível como documento emitido; prévia privada com `no-store`; outro vendedor bloqueado |
| Histórico isolado | **22 documentos aprovados** com PDF, Word e dados públicos preservados por hash |
| Integridade das versões | Original, template v3 e entregas anteriores PDF/DOCX preservados por hash |

Todas as páginas dos quatro cenários foram rasterizadas e examinadas. A conferência encontrou e corrigiu dois defeitos: subtotal isolado na continuação e quebra do valor total extenso. Pagamento, prazo e entrega agora formam um bloco identificado por “5.1”, inclusive quando passam à página seguinte. As obrigações permanecem em blocos separados e o aceite continua ao final.

Testes novos cobrem recuperação das responsabilidades, preservação de valores, ausência de comentários internos, venda só de peças, um ou dois emitentes, pendências curtas, garantia confirmada/ausente, compatibilidade do Word e preservação de cabeçalhos/linhas. Os testes de v3 continuam exercitando explicitamente o modelo anterior.

Execução na base isolada `gridone_proposals_f1_20261023`, localhost:5433, backend 3006 e frontend 3003. Apenas o backend isolado de validação foi reiniciado para carregar o código. Servidores e base principais preservados; automações e entregas externas desabilitadas no ambiente de teste.

## Entregas e evidências

- PDF: `output/pdf/proposta-manitec-identidade-revisada-previa.pdf`.
- Word editável: `output/docx/proposta-manitec-identidade-revisada-previa.docx`.
- Fonte reutilizável: diretório `backend/src/templates/documents/proposal/manitec-default-v4/` e seu construtor Python.
- Evidências privadas: `runtime-logs/proposta-identidade-20261030/`, incluindo cenários, renderizações, `checks-final.json`, `types-final.json`, `regression-final.json`, `regression-details-final.json`, `api-final.json` e hashes dos documentos preservados. Esse diretório contém informações de validação e não deve ser publicado.
- Original preservado: SHA-256 `5d95b4b7b7088eddda1191a3b976842f655de7533f50f245cdfae96c6810bb94`.
- HEAD mantido em `268398d3fc0e161b5e204c6a00eba68f6d8b8228`. Alterações preexistentes mantidas; sem commit ou push.

## Parecer

**Aprovado como prévia para revisão da Manitec e validação do novo padrão no ambiente isolado. O exemplo não está liberado para envio ao cliente enquanto as condições comerciais aplicáveis permanecerem pendentes.**

- **Médio — decisões comerciais:** contagem dos 10 dias, segunda parcela, disponibilidade/frete, eventual garantia, distribuição entre CNPJs, índice de correção e abrangência do cancelamento exigem definição. Consultar a lista interna separada.
- **Baixo — conversão:** dependência do LibreOffice e ocorrência pontual descrita abaixo; conversões finais e teste de API passaram.
- **Baixo — editores:** diferenças de paginação entre Microsoft Word e LibreOffice ainda são possíveis; abertura nativa no Word não automatizada.

## Limites

O PDF é gerado a partir dos bytes do DOCX pelo conversor do produto. Nesta rodada houve uma falha do LibreOffice no cenário extenso; a repetição passou. Não foi usado um PDF textual alternativo que descartasse o layout. A causa da falha pontual não foi confirmada e a dependência operacional do conversor permanece.

A abertura nativa no Microsoft Word não foi automatizada. As verificações usam o renderizador Word do Studio e LibreOffice; pequenas diferenças de paginação entre editores podem ocorrer. Este relatório cobre o padrão da proposta, não a homologação integral de todas as telas da Fase 1.
