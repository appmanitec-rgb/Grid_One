CREATE INDEX "proposals_userId_type_status_updatedAt_idx" ON "proposals"("userId", "type", "status", "updatedAt");
CREATE INDEX "proposals_type_status_validUntil_idx" ON "proposals"("type", "status", "validUntil");
CREATE INDEX "sales_opportunity_owner_pipeline_stage_idx" ON "sales_opportunities"("assignedSellerId", "pipeline", "stage", "updatedAt");
CREATE INDEX "crm_activities_ownerId_status_dueAt_idx" ON "crm_activities"("ownerId", "status", "dueAt");
CREATE INDEX "crm_activities_opportunityId_status_dueAt_idx" ON "crm_activities"("opportunityId", "status", "dueAt");
