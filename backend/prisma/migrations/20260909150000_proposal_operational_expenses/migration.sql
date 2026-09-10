CREATE TYPE "OperationalExpenseType" AS ENUM (
  'DISPLACEMENT',
  'MEAL',
  'TOLL',
  'LODGING',
  'PARKING'
);

ALTER TABLE "proposals"
  ADD COLUMN "operationalExpenses" JSONB,
  ADD COLUMN "operationalExpensesTotal" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "operational_expense_rates" (
  "id" TEXT NOT NULL,
  "expenseType" "OperationalExpenseType" NOT NULL,
  "label" TEXT NOT NULL,
  "unitLabel" TEXT NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_expense_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_expense_rates_expenseType_key"
  ON "operational_expense_rates"("expenseType");
CREATE INDEX "operational_expense_rates_isActive_sortOrder_idx"
  ON "operational_expense_rates"("isActive", "sortOrder");

INSERT INTO "operational_expense_rates"
  ("id", "expenseType", "label", "unitLabel", "unitPrice", "isActive", "sortOrder", "updatedAt")
VALUES
  ('b8b51290-9045-4e5f-a5fd-010000000001', 'DISPLACEMENT', 'Deslocamento', 'km', 2.50, true, 10, CURRENT_TIMESTAMP),
  ('b8b51290-9045-4e5f-a5fd-010000000002', 'MEAL', 'Alimentacao', 'refeicao', 45.00, true, 20, CURRENT_TIMESTAMP),
  ('b8b51290-9045-4e5f-a5fd-010000000003', 'TOLL', 'Pedagio', 'passagem', 15.00, true, 30, CURRENT_TIMESTAMP),
  ('b8b51290-9045-4e5f-a5fd-010000000004', 'LODGING', 'Hospedagem', 'diaria', 220.00, true, 40, CURRENT_TIMESTAMP),
  ('b8b51290-9045-4e5f-a5fd-010000000005', 'PARKING', 'Estacionamento', 'periodo', 30.00, true, 50, CURRENT_TIMESTAMP);
