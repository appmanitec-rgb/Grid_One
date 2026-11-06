# Proposta Manitec v5 — capa e papel timbrado restaurados

30/10/2026. A capa completa volta a ser parte obrigatória do padrão, conforme a orientação mais recente do usuário. O conteúdo comercial aprovado da v4 permanece preservado.

## Origem da identidade

O Word fornecido, `C:/Users/Usuário/Downloads/proposta-20024-00.docx`, contém as mesmas imagens de capa e cabeçalho que já estavam no modelo institucional v1 do sistema. A v5 reutiliza esses arquivos originais, sem reconstruir a arte, alterar fotografias ou depender da pasta Downloads para gerar novas propostas.

- Capa: SHA-256 `37440c699cff811101cb51d21904d92ec8c08079c102b89370806980446e28ba`.
- Cabeçalho: SHA-256 `6f48ff8d8a77709d87f081678c2bf82ab72d5e901120c4506858ccbd2c97081b`, com o corte inferior original definido no Word, preservando a proporção da marca e das faixas.
- Referência original preservada: SHA-256 `c4463500a13b4875e8b1b56fa5b52add62bc006ceccd86ce2569ba417cf6888a`.

## Resultado

- Primeira página A4 dedicada à capa institucional completa, sem sobreposição de cabeçalho ou rodapé.
- Cabeçalho timbrado azul/vermelho e identificação da proposta em todas as páginas de conteúdo.
- Rodapé com Manitec Grupos Geradores, telefone, WhatsApp, e-mail e site recuperados da referência, além da identificação da proposta e Página X de Y.
- A capa integra a contagem. No exemplo de quatro páginas, a primeira página de conteúdo é “Página 2 de 4”. Os campos PAGE e NUMPAGES são nativos e se atualizam na conversão e na abertura do Word.
- Margens reservadas para separar os elementos institucionais das tabelas, textos e assinatura.
- Corpo editável da v4 mantido: mesmos sete blocos, campos, valores, obrigações e condições. A única remoção na abertura interna é a logo ampliada, substituída pelo cabeçalho timbrado. Não se retirou informação comercial.

## Verificações

| Verificação | Resultado |
| --- | --- |
| Compilação TypeScript do backend isolado | Passou |
| Regressão de documentos, Studio, propostas, pagamentos, acesso e demais módulos selecionados | **327 testes passaram, 40 suítes, zero falhas** |
| ESLint dos três arquivos TypeScript alterados | Zero erros e avisos |
| Exemplo demonstrativo | **4 páginas**, capa + 3 páginas de conteúdo, total R$ 1.320,00 preservado |
| Caso extenso | **9 páginas**, 36 itens e 14 etapas completos, total R$ 15.290,00, cabeçalhos de tabelas repetidos e subtotais junto ao último item |
| Campos opcionais ausentes | **4 páginas**, ausências identificadas sem inventar condições |
| Cadastros extensos | **4 páginas**, nomes/endereço completos, cabeçalho e rodapé sem cortes ou sobreposição |
| Integridade do corpo comercial | Comparação canônica dos elementos XML confirma igualdade com a v4, exceto a logo de abertura removida e as duas seções de paginação |
| Estilos, numeração e tema | Partes preservadas byte a byte em relação à v4 |
| Imagens | Bytes originais da capa e do cabeçalho presentes nos quatro DOCX gerados |
| Numeração e contatos | Verificados em todas as páginas de conteúdo dos quatro PDFs |
| API real isolada | Prévia PDF privada com `no-store`; rascunho impedido de aparecer como documento emitido; outro vendedor bloqueado |
| Documentos históricos | **22 documentos aprovados da base isolada** mantêm PDF, Word e dados públicos inalterados por hash |
| Versões anteriores e referência | Templates v1/v4, entregas v4 e Word fornecido preservados por hash |

Os PDFs foram gerados a partir dos bytes dos respectivos DOCX pelo conversor do produto. Todas as páginas dos cenários foram rasterizadas e examinadas. O Word da entrega também foi renderizado pelo `render_docx.py` e suas quatro páginas foram conferidas. Não houve falha de conversão nesta rodada.

## Fonte e aplicação

- Construtor: `backend/scripts/build-proposal-template-v5.py`.
- Modelo: `backend/src/templates/documents/proposal/manitec-default-v5/`.
- O resolvedor institucional de novas propostas passa a usar v5. As versões anteriores continuam acessíveis explicitamente; os testes da v4 passam a fixar essa versão.
- Os testes de geração agora exigem a presença da capa, do cabeçalho, dos contatos e das duas seções, para detectar regressões nesse padrão.
- Modelos personalizados já publicados no Studio mantêm prioridade. Nenhum modelo foi republicado e nenhum documento aprovado foi reemitido.
- Evidências privadas: `runtime-logs/proposta-capa-20261030/`, incluindo contrato de execução, renderizações, `checks-final.json`, resultados de regressão, compilação e API. Não publicar esse diretório.

Ambiente: base isolada `gridone_proposals_f1_20261023`, localhost:5433, backend 3006. Apenas o servidor de validação foi reiniciado. Base e servidores principais preservados. Sem migração, envio externo, commit, push ou ativação em produção.

## Entrega e limites

Entregas: `output/pdf/proposta-manitec-capa-institucional-previa.pdf` e `output/docx/proposta-manitec-capa-institucional-previa.docx`.

**Aprovado para validação do padrão no ambiente isolado.** O exemplo continua identificado como prévia demonstrativa; as decisões comerciais já registradas em `proposta-v4-pendencias-internas.md` continuam aplicáveis. Esta rodada não mudou prazos, garantia, preços, recebíveis ou aprovação.

Riscos restantes: **médio**, condições comerciais pendentes antes do envio de uma proposta real; **baixo**, dependência operacional do LibreOffice e diferenças possíveis de paginação no Microsoft Word, cuja abertura nativa não foi automatizada. Essas limitações não foram substituídas por um PDF textual alternativo.
