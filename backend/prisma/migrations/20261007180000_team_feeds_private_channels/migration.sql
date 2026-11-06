ALTER TABLE "team_posts" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "team_posts" ADD COLUMN "eventKey" TEXT;
CREATE UNIQUE INDEX "team_posts_eventKey_key" ON "team_posts"("eventKey");
CREATE INDEX "team_posts_category_createdAt_idx" ON "team_posts"("category", "createdAt");

ALTER TABLE "team_channels" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "team_channels" ADD COLUMN "directKey" TEXT;
CREATE UNIQUE INDEX "team_channels_directKey_key" ON "team_channels"("directKey");

CREATE TABLE "team_channel_members" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "team_channel_members_pkey" PRIMARY KEY ("channelId","userId")
);
CREATE INDEX "team_channel_members_userId_idx" ON "team_channel_members"("userId");
ALTER TABLE "team_channel_members" ADD CONSTRAINT "team_channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "team_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_channel_members" ADD CONSTRAINT "team_channel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
