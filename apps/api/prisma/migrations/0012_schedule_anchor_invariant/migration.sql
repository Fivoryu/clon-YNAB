ALTER TABLE "ScheduledTransaction"
ADD CONSTRAINT "ScheduledTransaction_anchor_day_check"
CHECK (
  EXTRACT(DAY FROM "startDate") = LEAST(
    "dayOfMonth",
    EXTRACT(DAY FROM (date_trunc('month', "startDate") + INTERVAL '1 month - 1 day'))::int
  )
);
