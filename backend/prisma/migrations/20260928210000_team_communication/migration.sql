CREATE TABLE "team_posts" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3),
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_posts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_post_comments" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_post_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_post_reactions" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_post_reactions_pkey" PRIMARY KEY ("postId", "userId")
);

CREATE TABLE "team_channels" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdByUserId" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_messages" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_channel_reads" (
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_channel_reads_pkey" PRIMARY KEY ("channelId", "userId")
);

INSERT INTO "team_channels" ("id", "slug", "name", "description", "updatedAt") VALUES
  ('05c2c711-dab5-4547-86d6-2c2e801c14b2', 'geral', 'Geral', 'Comunicados e conversas de toda a equipe.', CURRENT_TIMESTAMP),
  ('cb95a840-4bed-4110-9823-21ca465d8864', 'comercial', 'Comercial', 'Alinhamentos de oportunidades, propostas e contratos.', CURRENT_TIMESTAMP),
  ('33651d79-6b71-4dca-9a84-d17834f6c539', 'operacao', 'Operação', 'Despacho, atendimento e execução em campo.', CURRENT_TIMESTAMP),
  ('957a3929-c24a-430e-a0b0-53bb3a1d95a9', 'suprimentos', 'Suprimentos', 'Estoque, compras e disponibilidade de peças.', CURRENT_TIMESTAMP);

CREATE INDEX "team_posts_pinnedAt_createdAt_idx" ON "team_posts"("pinnedAt", "createdAt");
CREATE INDEX "team_posts_createdAt_idx" ON "team_posts"("createdAt");
CREATE INDEX "team_post_comments_postId_createdAt_idx" ON "team_post_comments"("postId", "createdAt");
CREATE UNIQUE INDEX "team_channels_slug_key" ON "team_channels"("slug");
CREATE INDEX "team_channels_isArchived_name_idx" ON "team_channels"("isArchived", "name");
CREATE INDEX "team_messages_channelId_createdAt_idx" ON "team_messages"("channelId", "createdAt");

ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_post_comments" ADD CONSTRAINT "team_post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "team_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_post_comments" ADD CONSTRAINT "team_post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_post_reactions" ADD CONSTRAINT "team_post_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "team_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_post_reactions" ADD CONSTRAINT "team_post_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_channels" ADD CONSTRAINT "team_channels_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "team_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_channel_reads" ADD CONSTRAINT "team_channel_reads_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "team_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_channel_reads" ADD CONSTRAINT "team_channel_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
