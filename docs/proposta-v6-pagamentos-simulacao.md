# Proposta Manitec v6 — pagamentos, assinatura e simulação comercial

Concluído em 30/10/2026 no ambiente isolado de validação. Modelo v6 definido como padrão institucional no código e publicado como padrão de propostas no Studio desse ambiente. Base e servidores principais preservados; sem commit, push, migração ou ativação em produção.

## Documento atualizado

- Capa institucional completa, cabeçalho, contatos de rodapé e numeração preservados.
- Aceite com assinatura do responsável, nome do responsável e data em três parágrafos separados. Há espaço antes da assinatura e 16 pontos entre os campos, mantidos juntos na paginação.
- Quadro “Dados de pagamento” nas condições comerciais, com serviços e peças lado a lado. Cada bloco mostra valor dos itens, favorecido, CNPJ, banco, agência, conta e chave PIX.
- Serviços: MANITEC SERVICES GERADORES LTDA, CNPJ 24.878.520/0001-60, Santander, agência 3729, conta 13003264-4, PIX 24878520000160.
- Peças: MANITEC ENERGIA EQUIPAMENTOS LTDA, CNPJ 39.315.244/0001-07, Santander, agência 0157, conta 1300575-2, PIX 39315244000107.
- Instrução de entrada e saldo calculada a partir da condição cadastrada, incluindo a confirmação da entrada antes da liberação do atendimento/fornecimento. Não cria vencimentos nem registra recebimentos.
- Dados bancários seguem o snapshot do perfil selecionado. A complementação por contas institucionais que existia nesta rodada foi retirada na revisão de 04/11/2026, descrita ao final: o cadastro passou a ser a fonte exclusiva.
- Categoria ausente não mostra dados bancários de um fornecimento não contratado. Despesas e desconto geral são explicados separadamente; não se inventa distribuição fiscal entre CNPJs.

A primeira revisão visual encontrou uma observação isolada em uma página. As instruções foram encurtadas e o espaçamento do quadro foi ajustado, mantendo as fontes legíveis. O exemplo e a simulação final ficaram em quatro páginas.

## Simulação realizada

Registros fictícios e contas institucionais fornecidas pelo usuário, exclusivamente na base `gridone_proposals_f1_20261023`, localhost:5433, backend 3006 e frontend 3003. Nenhum e-mail, cobrança, pagamento ou atendimento real foi executado.

| Etapa | Resultado |
| --- | --- |
| Dados comerciais | Cliente, equipamento, vendedor, contas por categoria e condição 30/70 selecionados |
| Peças | 3 unidades a R$ 200,00: **R$ 600,00** |
| Serviços | 3 unidades a R$ 300,00: **R$ 900,00**; finalidade técnica descrita e escopo gerado/conferido |
| Revisão | Total **R$ 1.500,00**, entrada **R$ 450,00**, saldo **R$ 1.050,00**; sem despesas ou desconto geral |
| Rascunho | Quatro etapas salvas e recuperadas; repetição da criação retornou a mesma proposta |
| Contas/emitentes | Alerta de empresas distintas conferido com justificativa; sem atribuir o recebimento agregado automaticamente a um CNPJ |
| Privacidade | Outro vendedor bloqueado; vendedor impedido de aprovar a proposta |
| Aprovação | Envio à diretoria e aprovação por gestor fictício explicitamente designado como responsável pela carteira, com acesso à equipe e permissão de aprovação |
| Emissão | Documento gerado pela API; PDF e Word baixados e comparados com o snapshot aprovado |
| Revisão final | Proposta **20026/01**, em quatro páginas, com validade **13/11/2026** |
| Efeitos operacionais | Nenhuma O.S., recebível ou confirmação de entrada criada pela geração |

Os bloqueios existentes exigiram finalidade técnica e conferência do escopo antes da aprovação. A simulação cumpriu essas etapas. Perfis administrativos sem a designação de carteira não receberam acesso por causa do cargo. Nenhuma regra de acesso foi afrouxada; foi criado um gestor fictício de teste com as permissões necessárias, sem alterar os administradores existentes.

## Correção de validade e histórico

A inspeção identificou que uma validade cadastrada como 13/11 aparecia como 12/11 devido à conversão de meia-noite UTC para o fuso local. A validade agora é formatada como data de calendário. Há três casos de regressão para texto de data, texto ISO UTC e objeto Date.

A primeira emissão 20026/00 foi preservada. A correção foi demonstrada pelo fluxo normal de revisão, gerando 20026/01 e um novo snapshot. Os **22 documentos aprovados anteriores**, além da primeira emissão desta simulação, conservaram seus PDFs, arquivos Word e dados públicos por hash. O modelo v5 e suas entregas também foram preservados.

## Validação final

| Verificação | Resultado |
| --- | --- |
| Compilação TypeScript | Passou |
| Regressão de propostas, documentos/Studio, acesso, pagamentos e demais módulos selecionados | **337 testes passaram, 41 suítes, zero falhas** |
| ESLint dos oito arquivos de código/teste alterados | Zero erros e avisos |
| Simulação real de API | **12 verificações passaram**, zero falhas na execução final |
| Playwright real | Quatro etapas percorridas e tela do documento aberta em **1366 × 900**, escala 1, sem erros JavaScript |
| PDF e Word da emissão | Quatro páginas, todas rasterizadas e examinadas; Word final também renderizado por `render_docx.py` |
| Assinatura | Três campos independentes, ordem e espaçamento conferidos no XML e na imagem |
| Dados de pagamento | Valores, favorecidos, CNPJs, agências, contas e PIX conferidos no arquivo emitido |
| Privacidade | Observação interna sentinela ausente do documento e do snapshot público |
| Identidade | Imagens originais da capa e do timbrado preservadas por hash |

## Fonte e evidências

- Construção do modelo: `backend/scripts/build-proposal-template-v6.py`.
- Padrão: `backend/src/templates/documents/proposal/manitec-default-v6/`.
- Contexto de pagamentos: `backend/src/modules/documents/proposal-payment-layout.ts`.
- Emissão final: `output/pdf/proposta-manitec-pagamentos-assinatura-simulacao.pdf` e `output/docx/proposta-manitec-pagamentos-assinatura-simulacao.docx`.
- Evidências privadas: `runtime-logs/proposta-pagamentos-20261030/`, com resultados de API, Playwright, testes, compilação, lint, hashes, PDFs, Word e renderizações. Não publicar esse diretório.
- HEAD preservado: `268398d3fc0e161b5e204c6a00eba68f6d8b8228`.

## Parecer e limites

**Aprovado como padrão no ambiente de validação e para conferência da Manitec.** A simulação cobre abertura, revisão, aprovação e geração; não representa aceite de cliente, quitação da entrada ou operação em produção.

- **Médio — condições comerciais:** vencimentos, contagem do prazo de execução e eventual distribuição de ajustes entre emitentes precisam seguir o cadastro e a cobrança aprovados. Não se criaram datas ou regras fiscais para preencher lacunas. Os dados cadastrais fictícios da simulação continuam identificados no documento.
- **Baixo — conversão e editores:** o PDF depende do LibreOffice. Abertura nativa no Microsoft Word e validação mobile não foram automatizadas nesta rodada; não houve mudança de telas. As quatro páginas finais foram conferidas pela renderização disponível.
- As alterações não mudam alçadas, regras de recebíveis, necessidade de confirmação da entrada ou snapshots históricos. Demais condições comerciais já registradas na validação anterior continuam aplicáveis.

## Revisão de 04/11/2026 — cadastro como fonte exclusiva do pagamento

Na conferência solicitada pelo usuário, a seleção de perfis já consultava o cadastro ativo e salvava uma cópia dos dados por categoria na proposta. Contudo, o gerador v6 ainda tinha contas institucionais de reserva para campos ausentes. Essa duplicação foi removida de `proposal-payment-layout.ts`: CNPJ, banco, agência, conta, PIX e instruções de boleto agora vêm exclusivamente da seleção salva. Campo bancário ausente aparece como “A definir”, sem recuperar uma conta antiga.

O responsável autorizado mantém esses dados em **Manitec Studio → Dados → Contas para Propostas**. Ao criar uma proposta ou salvar novamente a seleção no editor de um rascunho, o serviço consulta os dados atuais do perfil escolhido. Peças e serviços mantêm contas e emitentes independentes. Trocar o perfil substitui os dados dessa categoria, respeitando a validação existente de CNPJ do emitente e do favorecido. Não é preciso alterar o modelo Word/PDF.

Uma alteração no cadastro não reescreve automaticamente propostas salvas. Rascunhos precisam ser reabertos e salvos com a seleção desejada; documentos aprovados/emitidos conservam o snapshot da aprovação e exigem uma revisão para mudar os dados. Não foram alteradas regras de aprovação, recebíveis ou permissões.

Validação desta revisão:

- **347 testes passaram em 42 suítes**, incluindo Studio, propostas, contas/emitentes, documentos, recebíveis/liberação financeira, privacidade e regressões dos módulos relacionados.
- Teste de criação com o mesmo perfil após mudança de banco/conta/PIX; os dados novos são gravados e o snapshot anterior permanece intacto.
- Teste de escolha de outro perfil e emitente; os dados e a identificação da empresa acompanham a seleção.
- Geração DOCX com conta substituta: nome, CNPJ, agência, conta e PIX corretos, conta de serviços anterior ausente e conta de peças preservada.
- Remoção de campos bancários para os dois CNPJs Manitec e um CNPJ diferente: nenhum dado de reserva reaparece.
- TypeScript sem emissão de arquivos: aprovado. Lint dos três arquivos TypeScript alterados: zero erros e avisos.
- Evidências privadas em `runtime-logs/proposta-pagamentos-dinamicos-20261104/`. Não houve nova inspeção visual/PDF nesta revisão; o layout não foi modificado e o conteúdo do Word foi inspecionado nos testes.

Esta revisão ficou no código local. Nenhuma base foi consultada ou alterada, nenhum servidor foi reiniciado e não houve publicação no Studio, commit, push ou ativação em produção. Os arquivos finais da simulação de 30/10 permanecem preservados.
