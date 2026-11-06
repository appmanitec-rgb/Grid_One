# Documento padrão de propostas — revisão v2

Data: 29/10/2026. Escopo: apresentação e preenchimento do Word padrão e do PDF derivado desse Word. Alterações locais, sem commit, push, migração ou ativação em produção.

## Resultado

O novo padrão `proposal/manitec-default-v2` preserva a capa e a identidade da Manitec e organiza os dados em um fluxo contínuo. Na reprodução da proposta 20024/00, o documento passou de **9 para 4 páginas**, incluindo a capa. Essa reprodução foi criada como prévia independente; os arquivos aprovados dessa proposta não foram substituídos.

O backend de validação foi recompilado em `dist-commercial`, na porta 3006, com frontend/proxy na porta 3003 e banco `gridone_proposals_f1_20261023`. Os servidores e bancos principais não foram alterados por esta revisão. Não houve envio a clientes, aprovação de propostas, geração de recebíveis ou publicação de modelo no Studio.

## Defeitos corrigidos

- Removidas as quebras de página artificiais, linhas vazias em excesso, tabelas aninhadas e alturas mínimas que geravam páginas quase vazias.
- Tabelas com largura definida, cabeçalhos repetidos e linhas preservadas na mudança de página. Valores financeiros alinhados à direita e total destacado.
- Código comercial do cliente no lugar do UUID interno. Razão social usada na identificação e no aceite, em vez do nome fantasia.
- Itens reunidos em uma tabela com descrição, código, quantidade, unidade, preço, desconto e total. Serviços por hora mostram `h` e a quantidade de horas.
- Descontos dos itens incluídos nos valores líquidos das linhas. O resumo desconta somente o desconto geral, sem subtrair novamente os descontos dos itens.
- Observações externas separadas dos dados de recebimento. Antes, dados bancários substituíam as observações quando os dois estavam preenchidos.
- Emitentes obtidos dos perfis de recebimento salvos na proposta, distinguindo peças e serviços. Retirados os CNPJs constantes do modelo e as alíquotas fiscais fixas; o campo fiscal segue a informação genérica já usada pelo sistema.
- Quebras de linha do escopo, das observações e dos dados de pagamento convertidas em quebras reais do Word.
- Validade e prazo sem valor mostram mensagens explícitas. A data do aceite permanece para preenchimento pelo cliente, sem assumir a data de emissão como assinatura.
- Na verificação da prévia, identificada e corrigida uma rota que permitia a um vendedor acessar o PDF de outro vendedor pelo endereço direto. O controller de Documentos agora usa o mesmo `CommercialScopeGuard` das propostas, respeitando carteira, responsável e liberação de equipe. O controle do portal do cliente continua nos serviços existentes.

As cláusulas operacionais, obrigações, inadimplemento e cancelamento existentes foram mantidas. A revisão não constitui revisão jurídica ou fiscal dessas cláusulas. Os campos repetidos de prazo e a tabela de aprovação com marcadores inválidos foram substituídos pela apresentação dos valores comerciais disponíveis e por um bloco de aceite limpo.

## Verificações concluídas

| Verificação | Resultado |
| --- | --- |
| Compilação TypeScript do backend isolado | Passou |
| Regressão de propostas, pagamentos, liberação financeira, autenticação, documentos/Studio, catálogo, clientes, equipamentos, escopos, portal e entregas | **306 testes passaram, 38 suítes, zero falhas** |
| ESLint com o cliente Prisma e tsconfig do ambiente isolado | **9 arquivos, zero erros e zero avisos** |
| API real pelo proxy 3003 | **4 verificações passaram**: projeção pública, PDF de rascunho, bloqueio de outro vendedor, integridade dos documentos congelados |
| Compatibilidade do Word editável do Studio | Passou: download da base, edição, preenchimento e preservação de imagens/campos |
| PDF e DOCX | Conversão real com o serviço do produto/LibreOffice; todos os PDFs finais rasterizados e examinados |
| Privacidade | Observações internas ausentes da projeção pública e dos PDFs; sem UUID do cliente no documento |
| Histórico | **22 documentos congelados** com os mesmos bytes de PDF/DOCX e os mesmos dados públicos |
| Administração | Hash dos três administradores originais preservado |
| Git | HEAD permaneceu `268398d3fc0e161b5e204c6a00eba68f6d8b8228`; sem commit/push |

A primeira execução do lint com o tsconfig geral identificou tipos não resolvidos por usar o cliente Prisma de outro build. A verificação final foi repetida com `runtime-commercial/tsconfig.documents-lint.json`, sem modificar o cliente ou a configuração principal.

## Cenários de documento

| Cenário | Páginas | Conferência |
| --- | ---: | --- |
| Reprodução independente do conteúdo congelado de 20024/00 | 4, antes 9 | Paginação e dados históricos disponíveis, sem regravar o original |
| Exemplo completo com peças e serviço por hora | 4 | Dois emitentes, desconto por item de 10%, desconto geral R$ 50, despesas R$ 100 e total R$ 1.320 |
| Documento longo, 36 itens e 15 etapas de escopo | 8 | Todos os 36 códigos presentes; cabeçalhos repetidos, sem perda de linhas; total do cenário R$ 15.290 |
| Equipamento/validade/prazo/observação opcionais ausentes | 4 | Mensagens de ausência; sem marcadores de automação pendentes |
| Rascunho real pela API | 4 | Código do cliente `4228CLI`, peças/serviços e dados públicos; resposta PDF com `private, no-store` |

As páginas de capa contêm imagem e não têm texto extraível; não são páginas em branco. Não foram encontrados cortes, sobreposições, marcadores não resolvidos ou páginas de corpo vazias na revisão final. Os espaços do bloco de assinatura são intencionais.

## Evidências e reprodução

- Prévia com dados fictícios: `output/pdf/proposta-manitec-modelo-v2-previa.pdf` e `output/docx/proposta-manitec-modelo-v2-previa.docx`.
- Imagens para comparação visual: `docs/evidencias/proposta-modelo-v2-20261029/`.
- Evidências técnicas locais: `runtime-logs/proposta-modelo-20261029/`, com `regression-final.json`, `types-final.json`, `lint-isolated.json`, `api-result.json`, `pdf-checks-final.json`, `pdf-inspection.json`, comparações de integridade e renderizações de todas as páginas. Esse diretório contém dados de validação e não deve ser publicado junto com os fontes.
- Fonte do modelo: `backend/src/templates/documents/proposal/manitec-default-v2/`.
- Construção reproduzível do DOCX: `backend/scripts/build-proposal-template-v2.py`, com `python-docx`. Lê o v1 sem gravá-lo e gera somente o diretório v2. O v1 fornece as imagens e as cláusulas existentes.

## Limites e aplicação

**Aprovado para validação do novo documento padrão no ambiente isolado.** Esta revisão não homologa novamente todas as telas e regras da Fase 1 nem ativa produção.

- **Baixo — dados de origem ausentes:** CNPJ/endereço/contato não cadastrados não são inventados. Snapshots antigos podem não conter o código comercial ou os perfis de recebimento adicionados à projeção atual. Continuam preservados e podem mostrar ausência desses dados.
- **Baixo — modelos personalizados:** um modelo já publicado no Studio mantém prioridade. A nova base pode ser baixada e revisada pelo responsável; esta alteração não substitui automaticamente publicações existentes. No banco isolado utilizado nesta revisão não havia modelo de proposta ativo.
- **Baixo — renderizadores:** a conferência foi feita com a conversão LibreOffice usada pela aplicação. Abertura no Microsoft Word não foi automatizada; pequenas diferenças de paginação entre editores ainda podem ocorrer. O PDF é derivado dos mesmos bytes de Word produzidos pelo gerador.
- **Históricos:** rebaixar o PDF de uma proposta já aprovada continua retornando o original. Para usar o novo layout em uma proposta histórica, deve-se seguir o fluxo existente de revisão/aprovação, sem editar o snapshot aprovado.
