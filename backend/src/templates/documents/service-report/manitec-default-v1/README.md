# Laudo Tecnico MANITEC DOCX v1

Template institucional Word para laudo tecnico, seguindo a identidade visual da proposta MANITEC.

Arquivos:

- `template.docx`: modelo Word inicial do laudo.
- `template.json`: fallback estruturado.
- `schema.json`: contrato de variaveis obrigatorias.
- `sample-data.json`: exemplo de preenchimento.

Importante:

O modulo de laudos ja possui PDF binario, validacao publica, QR, storage privado e controle documental. A migracao completa para DOCX institucional neste fluxo proprio ainda precisa de ciclo dedicado para nao quebrar versionamento, evidencias, aceite e retencao.

Cuidados:

- Manter placeholders como texto continuo.
- Nao incluir observacoes internas, notas de seguranca internas, `storageKey`, custo interno ou margem.
- Homologar visualmente no Word/LibreOffice antes de expor ao cliente.
