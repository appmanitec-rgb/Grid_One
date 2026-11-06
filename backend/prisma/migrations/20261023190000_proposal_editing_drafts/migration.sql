-- Additive editing workspace. Does not change commercial proposals, prices or approvals.
CREATE TABLE "proposal_editing_drafts" (
 "id" TEXT NOT NULL, "ownerUserId" TEXT NOT NULL, "proposalId" TEXT,
 "formData" JSONB NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
 "lastRequestKey" TEXT NOT NULL, "lastRequestHash" TEXT NOT NULL,
 "clicks" INTEGER NOT NULL DEFAULT 0, "edits" INTEGER NOT NULL DEFAULT 0,
 "firstReadyAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "proposal_editing_drafts_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "proposal_editing_drafts_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "proposal_editing_drafts_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "proposal_editing_drafts_ownerUserId_updatedAt_idx" ON "proposal_editing_drafts"("ownerUserId", "updatedAt");
CREATE INDEX "proposal_editing_drafts_proposalId_idx" ON "proposal_editing_drafts"("proposalId");
CREATE TABLE "proposal_document_snapshots" (
    "proposalId" TEXT NOT NULL,
    "publicData" JSONB NOT NULL,
    "pdfBytes" BYTEA NOT NULL,
    "docxBytes" BYTEA NOT NULL,
    "html" TEXT,
    "templateKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proposal_document_snapshots_pkey" PRIMARY KEY ("proposalId"),
    CONSTRAINT "proposal_document_snapshots_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

