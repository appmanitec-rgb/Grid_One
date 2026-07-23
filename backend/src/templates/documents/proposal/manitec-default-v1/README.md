# Proposta MANITEC DOCX v1

Template institucional oficial da proposta comercial.

## Arquivos

- `template.docx`: modelo Word principal. Quando existe, o backend usa este arquivo como fonte do DOCX final.
- `template.json`: fallback estruturado para ambientes sem Word binario.
- `schema.json`: contrato de variaveis obrigatorias.
- `sample-data.json`: exemplo para revisar o preenchimento do modelo.

## Como editar

Abra `template.docx` no Word ou LibreOffice, ajuste o visual e mantenha os placeholders no formato `{{caminho.da.variavel}}`.

Para listas, use:

```text
{{#items}}
{{description}} - {{quantity}} {{unit}} - {{total}}
{{/items}}
```

Cuidados:

- Nao estilize metade de um placeholder. Digite `{{proposal.number}}` como um texto continuo.
- Nao remova variaveis obrigatorias sem atualizar `schema.json`.
- Nao coloque custo interno, margem, `hourCost`, `storageKey` ou dados administrativos no modelo do cliente.
- O PDF institucional e gerado pelo backend convertendo este DOCX via LibreOffice headless.
