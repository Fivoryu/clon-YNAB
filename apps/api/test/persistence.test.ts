import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withPostgresTransaction } from '../src/persistence/transaction.ts';

const schemaPath = new URL('../prisma/schema.prisma', import.meta.url);
const migrationPath = new URL('../prisma/migrations/0002_ownership_consistency/migration.sql', import.meta.url);

test('Prisma financial work is delegated through one transaction callback', async () => {
  let calls = 0;
  let transactionMarker = '';
  const client = {
    $transaction: async <T>(work: (tx: { marker: string }) => Promise<T>) => {
      calls += 1;
      return work({ marker: 'postgres-transaction' });
    },
  };
  const result = await withPostgresTransaction(client, async tx => {
    transactionMarker = tx.marker;
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(calls, 1);
  assert.equal(transactionMarker, 'postgres-transaction');
});

test('schema and migration enforce budget-scoped account and category references', async () => {
  const schema = await readFile(schemaPath, 'utf8');
  const migration = await readFile(migrationPath, 'utf8');
  assert.match(schema, /@@unique\(\[budgetId, id\]\)/);
  assert.match(schema, /fields: \[budgetId, accountId\], references: \[budgetId, id\]/);
  assert.match(schema, /fields: \[budgetId, categoryId\], references: \[budgetId, id\]/);
  assert.match(schema, /fields: \[budgetId, relatedEventId\], references: \[budgetId, id\]/);
  assert.match(migration, /FOREIGN KEY \("budgetId", "accountId"\)\s+REFERENCES "Account"\s*\("budgetId", "id"\)/);
  assert.match(migration, /FOREIGN KEY \("budgetId", "categoryId"\)\s+REFERENCES "Category"\s*\("budgetId", "id"\)/);
  assert.match(migration, /FOREIGN KEY \("budgetId", "relatedEventId"\)\s+REFERENCES "FinancialEvent"\s*\("budgetId", "id"\)/);
});
