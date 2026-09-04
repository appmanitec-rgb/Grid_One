INSERT INTO "control_options" (
  "id",
  "group",
  "type",
  "code",
  "name",
  "description",
  "sortOrder",
  "isActive"
) VALUES
  (gen_random_uuid()::text, 'catalog', 'CATALOG_DOCUMENT_CATEGORY', 'ORCAMENTO', 'Orcamento', 'Cotacao, proposta de fornecedor ou documento de compra.', 5, true),
  (gen_random_uuid()::text, 'catalog', 'CATALOG_DOCUMENT_CATEGORY', 'FICHA_TECNICA', 'Ficha tecnica', 'Ficha tecnica ou especificacao do item.', 10, true),
  (gen_random_uuid()::text, 'catalog', 'CATALOG_DOCUMENT_CATEGORY', 'CERTIFICADO', 'Certificado', 'Certificado, CA, laudo ou conformidade.', 35, true),
  (gen_random_uuid()::text, 'catalog', 'CATALOG_DOCUMENT_CATEGORY', 'OUTRO', 'Outro', 'Documento nao classificado nas categorias principais.', 999, true),
  (gen_random_uuid()::text, 'operation', 'MAINTENANCE_TEMPLATE_CATEGORY', 'SPARK_PLUG', 'Velas', 'Velas de ignicao e componentes associados.', 35, true),
  (gen_random_uuid()::text, 'operation', 'MAINTENANCE_TEMPLATE_CATEGORY', 'OTHER', 'Outro', 'Categoria tecnica nao classificada.', 999, true)
ON CONFLICT ("type", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sortOrder" = LEAST("control_options"."sortOrder", EXCLUDED."sortOrder"),
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
