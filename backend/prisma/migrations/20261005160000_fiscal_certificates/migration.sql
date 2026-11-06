CREATE TABLE "fiscal_certificates" (
    "id" TEXT NOT NULL,
    "issuerCompanyId" TEXT NOT NULL,
    "encryptedBundle" BYTEA NOT NULL,
    "initializationVec" BYTEA NOT NULL,
    "authenticationTag" BYTEA NOT NULL,
    "fingerprintSha256" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "certificateCnpj" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "installedByUserId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_certificates_issuerCompanyId_key" ON "fiscal_certificates"("issuerCompanyId");
CREATE INDEX "fiscal_certificates_validTo_idx" ON "fiscal_certificates"("validTo");
ALTER TABLE "fiscal_certificates" ADD CONSTRAINT "fiscal_certificates_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId") REFERENCES "company_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
