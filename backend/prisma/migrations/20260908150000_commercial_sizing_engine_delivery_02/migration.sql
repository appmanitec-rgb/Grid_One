ALTER TABLE "commercial_sizing_policies"
  ADD COLUMN "defaultPowerFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

ALTER TABLE "commercial_sizing_policies"
  ADD CONSTRAINT "commercial_sizing_policies_power_factor_check"
  CHECK ("defaultPowerFactor" > 0 AND "defaultPowerFactor" <= 1);
