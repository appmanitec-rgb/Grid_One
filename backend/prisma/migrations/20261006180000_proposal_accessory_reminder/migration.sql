INSERT INTO "control_options" (
  "id", "group", "type", "code", "name", "description", "sortOrder",
  "isActive", "isBlockedForNewClients", "createdAt", "updatedAt"
)
VALUES (
  'a62c3779-d9a0-4f23-9efb-0f43316a9c12',
  'commercial',
  'PROPOSAL_ACCESSORY_RULE',
  'MANGUEIRA',
  'Abraçadeira',
  'Esta mangueira precisa de abraçadeira na montagem? Confira se a quantidade foi incluída na proposta.',
  1,
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("type", "code") DO NOTHING;
