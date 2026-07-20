# Auditoria de templates PDF

## Decisao tecnica

PDF de documento comercial nao deve ser gerado como impressao da tela do ERP/Portal. Tela e feita para navegacao, responsividade e interacao; PDF precisa ser documento A4, com template proprio, variaveis controladas, versao rastreavel, hash e armazenamento documental.

## Motor criado

- Templates versionados por pasta em `backend/src/templates/pdf`.
- `DocumentTemplateService` carrega `template.html`, `style.css`, `schema.json` e `sample-data.json`.
- `TemplateRendererService` renderiza variaveis `{{path}}` e repeticoes `{{#each items}}`.
- `PdfRenderService` gera PDF A4 server-side sem depender do frontend.
- `ProposalPdfService` monta dados seguros da proposta e gera PDF profissional.
- `DocumentsService` salva o PDF no storage privado e cria `DocumentDelivery` com template, versao e checksum.

## Estado por documento

| Documento | Status | Evidencia |
| --- | --- | --- |
| Proposta comercial | Implementado | `proposal/manitec-default-v1`, endpoint `/documents/proposals/:id/download-pdf`, portal `/customer-portal/proposals/:id/download-pdf` |
| Contrato | Estrutura preparada | `contract/manitec-default-v1` criado, render funcional ainda pendente |
| Laudo tecnico | Parcial | Ja existia PDF server-side simples; pasta `service-report/manitec-default-v1` criada para migracao futura |
| Ordem de servico | Estrutura preparada | `work-order/manitec-default-v1` criado, render funcional ainda pendente |
| Recibo/financeiro | Nao implementado | Nao ha template financeiro dedicado neste ciclo |

## Garantias da proposta

- Nao usa pagina do frontend.
- Nao inclui sidebar, menu, botoes, cards de UI ou CSS global do app.
- Usa dados reais da proposta, cliente, vendedor, equipamento e itens.
- Campos opcionais renderizam sem quebrar o documento.
- Nao expoe custo interno, margem, limite de desconto, permissao ou observacoes internas.
- Salva `DocumentDelivery` com `fileStorageKey`, `checksumSha256`, template e versao no `payloadSnapshot`.
- Download do portal respeita escopo do cliente autenticado.

## Pendencias

- Trocar o renderizador interno simples por Playwright/Chromium quando o ambiente de producao tiver dependencia homologada.
- Migrar contrato para PDF profissional completo.
- Migrar laudo tecnico para o mesmo motor HTML/CSS versionado, mantendo QR/validacao.
- Criar template de OS e recibos financeiros.
- Criar preview administrativo de templates e, futuramente, editor controlado.
