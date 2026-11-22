ALTER TABLE "projects" ADD COLUMN "owner_github_id" text;--> statement-breakpoint
CREATE INDEX "projects_owner_github_idx" ON "projects" USING btree ("owner_github_id");