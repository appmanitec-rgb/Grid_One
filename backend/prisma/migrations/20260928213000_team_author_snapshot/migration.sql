ALTER TABLE "team_posts" ADD COLUMN "authorName" TEXT;
ALTER TABLE "team_post_comments" ADD COLUMN "authorName" TEXT;
ALTER TABLE "team_messages" ADD COLUMN "authorName" TEXT;

UPDATE "team_posts" p SET "authorName" = u."name" FROM "users" u WHERE p."authorId" = u."id";
UPDATE "team_post_comments" c SET "authorName" = u."name" FROM "users" u WHERE c."authorId" = u."id";
UPDATE "team_messages" m SET "authorName" = u."name" FROM "users" u WHERE m."authorId" = u."id";

ALTER TABLE "team_posts" ALTER COLUMN "authorName" SET NOT NULL;
ALTER TABLE "team_post_comments" ALTER COLUMN "authorName" SET NOT NULL;
ALTER TABLE "team_messages" ALTER COLUMN "authorName" SET NOT NULL;
ALTER TABLE "team_posts" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "team_post_comments" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "team_messages" ALTER COLUMN "authorId" DROP NOT NULL;

ALTER TABLE "team_posts" DROP CONSTRAINT "team_posts_authorId_fkey";
ALTER TABLE "team_post_comments" DROP CONSTRAINT "team_post_comments_authorId_fkey";
ALTER TABLE "team_messages" DROP CONSTRAINT "team_messages_authorId_fkey";
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_post_comments" ADD CONSTRAINT "team_post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
