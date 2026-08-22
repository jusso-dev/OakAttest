ALTER TABLE "essential_eight_profiles"
  ADD COLUMN "assessment_guide_version" text DEFAULT '2024-08' NOT NULL;

ALTER TABLE "essential_eight_profiles"
  ADD COLUMN "criteria_model_version" text DEFAULT 'ism-mapped-v1' NOT NULL;
