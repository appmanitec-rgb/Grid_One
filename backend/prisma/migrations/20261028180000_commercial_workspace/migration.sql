CREATE TABLE "commercial_proposal_estimates" (
 "id" TEXT NOT NULL, "proposalId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
 "sourceHash" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "actorUserId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "commercial_proposal_estimates_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "commercial_proposal_estimates_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "commercial_proposal_estimates_proposalId_key" ON "commercial_proposal_estimates"("proposalId");
CREATE TABLE "commercial_content_templates" (
 "id" TEXT NOT NULL, "key" TEXT NOT NULL, "version" INTEGER NOT NULL, "portfolio" TEXT NOT NULL,
 "category" TEXT NOT NULL, "name" TEXT NOT NULL, "subject" TEXT, "body" TEXT NOT NULL,
 "createdByUserId" TEXT NOT NULL, "publishedByUserId" TEXT, "publishedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "commercial_content_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commercial_content_templates_key_version_key" ON "commercial_content_templates"("key", "version");
CREATE INDEX "commercial_content_templates_portfolio_category_publishedAt_idx" ON "commercial_content_templates"("portfolio", "category", "publishedAt");
CREATE TABLE "commercial_handoff_tasks" (
 "id" TEXT NOT NULL, "proposalId" TEXT NOT NULL, "step" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
 "dueAt" TIMESTAMP(3) NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "updatedByUserId" TEXT NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "commercial_handoff_tasks_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "commercial_handoff_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "commercial_handoff_tasks_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "commercial_handoff_tasks_proposalId_step_key" ON "commercial_handoff_tasks"("proposalId", "step");
CREATE INDEX "commercial_handoff_tasks_ownerId_dueAt_idx" ON "commercial_handoff_tasks"("ownerId", "dueAt");
