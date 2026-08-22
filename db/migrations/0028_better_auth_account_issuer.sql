ALTER TABLE "accounts" ADD COLUMN "issuer" text;

UPDATE "accounts"
SET "issuer" = CASE
  WHEN "provider_id" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "provider_id"
END
WHERE "issuer" IS NULL;

ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;

DROP INDEX "accounts_provider_account_uq";
CREATE UNIQUE INDEX "accounts_issuer_account_uq" ON "accounts" USING btree ("issuer", "account_id");
