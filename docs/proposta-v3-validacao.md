# Proposta comercial Manitec v3 — validação da reformulação

Concluído em 30/10/2026. Trabalho iniciado em 29/10/2026, usando o PDF demonstrativo indicado pelo usuário. Resultado: **prévia para revisão comercial**, sem envio ao cliente, publicação em produção, migração, commit ou push.

## Resultado entregue

- Proposta demonstrativa reformulada em **2 páginas**, antes 4. A capa institucional foi removida e substituída por um cabeçalho compacto com a marca.
- Primeira página com identificação, equipamento, objetivo, peças e materiais, serviços e mão de obra, subtotais, deslocamento, demais despesas, desconto geral, total, pagamento, prazo e condições essenciais.
- Segunda página com escopo, disponibilidade e agendamento, responsabilidades, dados de faturamento/recebimento, garantia pendente de confirmação, condições de atraso/cancelamento e aceite.
- Total preservado em **R$ 1.320,00**: materiais líquidos R$ 910,00 + mão de obra líquida R$ 360,00 + deslocamento R$ 100,00 − desconto geral R$ 50,00. Os descontos dos itens não foram repetidos no resumo.
- Nos casos extensos, o resumo comercial permanece na primeira página e as tabelas completas seguem no detalhamento. Cabeçalhos de categoria se repetem e as etapas do escopo permanecem inteiras na mudança de página.

Os dados demonstrativos continuam identificados como exemplo e prévia. Emissão, validade, itens, quantidades, unidades e preços da referência foram preservados. O prazo de 10 dias não foi convertido arbitrariamente em dias úteis ou corridos; a segunda parcela continua sem data inventada.

## Conteúdo e condições comerciais

A promessa genérica de substituição em 48 horas foi removida. O novo texto distingue diagnóstico/orçamento, disponibilidade ou aquisição das peças e agendamento de acesso/execução. Peças sob encomenda dependem da previsão informada pelo fabricante ou distribuidor, com comunicação de alterações ao cliente.

Foram retiradas as cláusulas genéricas de obra e as referências técnicas sem pertinência confirmada. Uma observação de instalação aparece somente quando a atividade está expressamente incluída no escopo; menções que a excluem não acionam a observação. Não foram criados garantia, laudo, ART, certificação, prazo de retorno ou compromisso de entrega.

Os percentuais anteriores de inadimplemento e cancelamento foram mantidos e sinalizados para confirmação. O trecho incompleto sobre 30 dias/cobrança complementar não foi completado por interpretação. A distribuição das parcelas entre diferentes CNPJs também não foi presumida.

As decisões restantes estão em [proposta-v3-decisoes-comerciais.md](proposta-v3-decisoes-comerciais.md). Esta prévia não está liberada para envio ao cliente.

## Origem reutilizável atualizada

- Novo padrão: `backend/src/templates/documents/proposal/manitec-default-v3/`, com DOCX editável, schema, exemplo e definição de apresentação.
- Construção reproduzível: `backend/scripts/build-proposal-template-v3.py`.
- Contexto comercial de apresentação: `backend/src/modules/documents/proposal-client-layout.ts`, integrado ao contexto institucional. Não altera preços, parcelas, aprovação, recebíveis ou dados operacionais.
- O resolvedor institucional passa a usar v3 para novas propostas. Outros tipos de documento mantêm seus padrões anteriores. V1 e v2 continuam acessíveis explicitamente.
- O editor Word do Studio reconhece as tabelas e os novos campos em português, agrupados em Proposta. Os marcadores internos de layout ficam em bookmarks do Word; o vendedor não precisa manipulá-los.
- Modelos personalizados publicados no Studio mantêm prioridade e não foram republicados. Documentos aprovados continuam retornando seus arquivos congelados.

## Evidências de teste

| Verificação | Resultado final |
| --- | --- |
| Compilação TypeScript do backend isolado | Passou |
| Regressão de propostas, pagamentos, liberação financeira, autenticação, documentos/Studio, catálogo, escopos, clientes, equipamentos, portal e entregas | **318 testes passaram, 39 suítes, zero falhas** |
| ESLint dos 9 arquivos de código/teste revisados | **Zero erros e zero avisos** |
| Proposta demonstrativa pequena | 2 páginas; condições essenciais e R$ 1.320,00 na primeira |
| Proposta extensa | 36 itens com descrições longas e 14 etapas, em 6 páginas; cada código aparece uma única vez; R$ 15.290,00 na primeira página |
| Proposta com dados opcionais ausentes | 2 páginas; ausências e necessidade de confirmação explícitas |
| API real de prévia em rascunho | PDF do novo padrão, resposta privada e `no-store` |
| Acesso comercial | Outro vendedor bloqueado; rascunho não tratado como documento aprovado |
| Histórico | **22 documentos aprovados** com PDF, Word e dados públicos inalterados |
| Compatibilidade do Studio | Base Word, edição, preenchimento, imagens e campos passaram nos testes |
| Integridade dos arquivos | Arquivos DOCX válidos; sem marcadores pendentes no resultado; PDF original e modelo v2 preservados |

A execução usou o banco isolado `gridone_proposals_f1_20261023`, backend 3006 e frontend de validação 3003. O banco e os servidores principais não foram alterados. Automações e entregas externas permaneceram desabilitadas no ambiente isolado.

O PDF foi derivado dos bytes do Word pelo conversor usado no produto. O DOCX final também foi renderizado pelo `render_docx.py` da habilidade de documentos. Todas as páginas dos cenários finais foram rasterizadas e examinadas: sem cortes, sobreposições, linhas de itens divididas, etapas incompletas no início da página ou página isolada só para assinatura. O cenário extenso mantém o aceite ao final da sexta página.

Na primeira execução após a retomada, o conversor retornou indisponibilidade. A conversão nativa e as execuções seguintes do serviço, inclusive a API, passaram. Não foi criada uma saída textual alternativa que mudasse o documento. A dependência do LibreOffice permanece como limitação operacional; a causa da falha inicial não foi confirmada.

## Arquivos e reprodução

- Entrega: `output/pdf/proposta-manitec-reformulada-previa.pdf` e `output/docx/proposta-manitec-reformulada-previa.docx`.
- Fonte preservada: `C:/Users/Usuário/Downloads/proposta-manitec-modelo-v2-previa.pdf`, SHA-256 `5d95b4b7b7088eddda1191a3b976842f655de7533f50f245cdfae96c6810bb94`.
- Evidências locais: `runtime-logs/proposta-reformulacao-20261029/`, incluindo `regression-final.json`, `types-final.json`, `lint-final.json`, `api-final.json`, `checks-final.json`, comparação dos snapshots e renderizações. Esse diretório contém dados de validação e não deve ser publicado.
- HEAD preservado em `268398d3fc0e161b5e204c6a00eba68f6d8b8228`; alterações preexistentes mantidas.

## Parecer e limites

**Aprovado para revisão da proposta e validação do novo padrão no ambiente isolado. Não aprovado para envio ao cliente enquanto as condições comerciais pendentes não forem confirmadas.**

- **Médio — condições comerciais:** contagem dos 10 dias, vencimento da segunda parcela, disponibilidade/frete, garantia, entregas técnicas, faturamento entre CNPJs e redação de atraso/cancelamento exigem decisão da Manitec.
- **Baixo — conversão:** o PDF depende do LibreOffice e dos recursos disponíveis no servidor. As verificações finais passaram, com a ocorrência inicial registrada acima.
- **Baixo — editores:** o Word foi validado pela renderização LibreOffice e pelo editor do Studio em testes automatizados. Abertura nativa no Microsoft Word não foi automatizada; pequenas diferenças de paginação entre editores ainda podem ocorrer.
- **Aplicação:** a mudança do padrão não reescreve arquivos aprovados nem substitui publicações personalizadas do Studio. Não constitui homologação completa de todas as telas da Fase 1.
