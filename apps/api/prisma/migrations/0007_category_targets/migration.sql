CREATE TYPE "CategoryTargetKind" AS ENUM ('MONTHLY_SET_ASIDE', 'BALANCE_BY_DATE');

CREATE TABLE "CategoryTarget" (
  "categoryId" UUID NOT NULL,
  "budgetId" UUID NOT NULL,
  "kind" "CategoryTargetKind" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "targetMonth" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "CategoryTarget_pkey" PRIMARY KEY ("categoryId"),
  CONSTRAINT "CategoryTarget_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT,
  CONSTRAINT "CategoryTarget_budgetId_categoryId_fkey" FOREIGN KEY ("budgetId", "categoryId") REFERENCES "Category"("budgetId", "id") ON DELETE RESTRICT
);
