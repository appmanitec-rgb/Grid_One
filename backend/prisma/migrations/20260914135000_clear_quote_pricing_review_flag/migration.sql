UPDATE "catalog_items"
SET "taxProfile" = jsonb_set(
  jsonb_set(
    COALESCE("taxProfile", '{}'::jsonb),
    '{pricingNeedsReview}',
    'false'::jsonb,
    true
  ),
  '{pricingNeedsReviewReason}',
  'null'::jsonb,
  true
)
WHERE "taxProfile"->>'pricingNeedsReviewReason' =
  'Oferta preferencial alterada; enviar nova formacao de preco ao Financeiro.';
