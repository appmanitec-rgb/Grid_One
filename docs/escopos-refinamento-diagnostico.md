# Refinamento do gerador de escopos — diagnóstico prévio

23/10/2026. PRP recebido no anexo `3b248dbf-2d54-4a87-a3ce-4724d09ec892`. Implementação na branch de desenvolvimento atual, preservando o workspace da Fase 1. Sem commit, push, migração principal ou produção.

## Fluxo identificado antes das alterações

1. O vendedor seleciona peças, serviços do catálogo e horas no formulário de quatro etapas. A revisão chama `TechnicalScopeGenerator`.
2. `POST /proposals/technical-scope/preview` valida usuário/carteira, cliente e equipamento; resolve os nomes reais e consulta famílias, procedimentos e perfis do catálogo.
3. `composeTechnicalScope` associa somente vínculos explícitos, verifica compatibilidade/requisitos e deduplica atividades por identificador. Materiais não contratam mão de obra e testes com carga geram condições operacionais pendentes.
4. A aplicação envia hashes e revisão humana. `persistProposalTechnicalScope` registra texto, fontes/definições, versões, autor e alterações manuais dentro da transação da proposta.
5. A Fase 1 confere pendências e alçadas, congela PDF/DOCX na aprovação e transmite o snapshot contratado para a O.S.; autorizações operacionais permanecem separadas.

## Biblioteca e apresentação

- `/dashboard/catalog/technical-library`: famílias, procedimentos e vínculos; edição exige permissão do catálogo. `TechnicalScopeCatalogPanel` também aparece na ficha do item. Procedimentos possuem atividades, sequência, requisitos, compatibilidade e condições.
- Títulos/formatação/identidade/campos pertencem aos modelos visuais e Word existentes no módulo Documentos. O motor entrega conteúdo e agrupamentos técnicos; não deve criar outro editor documental.
- A biblioteca inicial é instalada explicitamente e não substitui procedimentos existentes. A atualização de textos padrão no código não pode reescrever a biblioteca nem documentos já aprovados.

## Desvios encontrados

- O motor sempre adiciona uma introdução genérica e o título “ESCOPO TÉCNICO DOS SERVIÇOS”, inclusive para fornecimento sem mão de obra.
- Serviço sem procedimento vira texto público “Serviço comercial ... Detalhamento técnico sujeito à validação”, com apenas aviso interno. Isso permite conteúdo insuficiente.
- Não existe classificação por proposta de serviço genérico/horas; o vendedor precisaria editar o catálogo ou redigir o escopo final.
- A conferência técnica só é calculada em alguns caminhos com revisão/snapshot. A API precisa bloquear liberação de serviço sem finalidade/execução também quando não se usa o botão de gerar.
- Preparação e finalização são deduplicadas, mas as quantidades/horas dos serviços precisam permanecer explícitas quando procedimentos são compartilhados.
- Alertas individuais extensos repetem condições que já possuem painel próprio. A resolução deve estar na etapa Serviços e a revisão deve consolidar pendências.

## Dados e decisões

Disponíveis: itens/quantidades/horas, nomes de catálogo, famílias/procedimentos e suas versões, equipamento e suas características cadastradas, contas, permissões e histórico técnico/documental. Faltam, quando não cadastrados: finalidade do serviço genérico, execução acordada, dados específicos do equipamento e autorização operacional.

A classificação será explícita por proposta, por serviço comercial: selecionar procedimentos existentes ou fornecer descrição manual mínima de finalidade/execução com as permissões de edição da proposta. Será registrada no snapshot e no rascunho; não alterará preços, catálogo ou autorização de execução. Fornecimento isolado continuará sem exigir procedimento de substituição. Nada será inferido a partir de embalagem de óleo, nomes aproximados ou notas internas.

Os cenários do PRP, as regressões da Fase 1 e a integridade da base principal serão conferidos em banco isolado. Validação visual só poderá ser declarada se o navegador responder; a limitação anterior continua aberta até nova evidência.
