import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { InMemorySimulationStore } from '../src/persistence/in-memory-simulation-store.ts';
import { PrismaSimulationStore, SimulationPersistenceError } from '../src/persistence/simulation-store.ts';
import { FinancialStore } from '../src/persistence/financial-store.ts';
import { ReportService } from '../src/reports/report-service.ts';
import { serializeTransactionCsv } from '../src/planning/csv.ts';

const postgresEnabled = Boolean(process.env.DATABASE_URL);
const prisma = postgresEnabled ? new (await import('@prisma/client')).PrismaClient() : null;

const schemaPath = 'apps/api/prisma/schema.prisma';
const migrationPath = 'apps/api/prisma/migrations/0006_bank_provider_simulation/migration.sql';

test('simulation schema is isolated, bounded, owner-scoped, and additively seeded', async () => {
  const schema = await readFile(schemaPath, 'utf8');
  const migration = await readFile(migrationPath, 'utf8');
  for (const name of ['SimulationProfile', 'SimulationScope', 'SimulationRun', 'SimulationAttempt', 'SimulationCheckpoint', 'SimulatedRecord', 'SimulationCandidate', 'SimulationCandidateEvent', 'SimulationAuditEntry', 'SimulationCommandReceipt']) assert.match(schema, new RegExp(`model ${name}\\s`));
  for (const name of ['SimulationRunState', 'SimulationCandidateStatus', 'SimulationCommand', 'SimulationOutcome']) assert.match(schema, new RegExp(`enum ${name}\\s`));
  for (const constraint of ['budgetId', 'idempotencyKey', 'payloadDigest', 'auditSequence', 'lockVersion', 'amountMinor']) assert.match(migration, new RegExp(`"${constraint}"`));
  const simulationModels = schema.match(/model Simulation(?:Profile|Scope|Run|Attempt|Checkpoint|Candidate|CandidateEvent|AuditEntry|CommandReceipt) \\{[\\s\\S]*?\\n\\}/g)?.join('\\n') ?? '';
  for (const name of ['FinancialEvent', 'Transfer', 'CommandReceipt', 'Account', 'Category']) assert.doesNotMatch(simulationModels, new RegExp(`\\b${name}\\b.*@relation`, 's'));
  assert.match(migration, /CREATE TABLE "SimulationProfile"/);
  assert.match(migration, /BO_INSPIRED_A/);
  assert.match(migration, /CREATE UNIQUE INDEX|UNIQUE/);
  assert.match(migration, /CHECK/);
  assert.doesNotMatch(migration, /ALTER TABLE "(FinancialEvent|Transfer|CommandReceipt)"/);
});

const cleanup = async (budgetId: string, ownerId: string) => {
  if (!prisma) return;
  await prisma.$executeRaw`DELETE FROM "SimulationCommandReceipt" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationCandidateEvent" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationCandidate" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulatedRecord" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationCheckpoint" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationAttempt" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationAuditEntry" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationRun" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "SimulationScope" WHERE "budgetId" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "Budget" WHERE "id" = ${budgetId}::uuid`;
  await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = ${ownerId}::uuid`;
};

const createFixture = async () => {
  const ownerId = randomUUID();
  const budgetId = randomUUID();
  await prisma!.$executeRaw`INSERT INTO "User" ("id", "email", "passwordHash") VALUES (${ownerId}::uuid, ${`${ownerId}@example.test`}, 'test')`;
  await prisma!.$executeRaw`INSERT INTO "Budget" ("id", "ownerId") VALUES (${budgetId}::uuid, ${ownerId}::uuid)`;
  return { ownerId, budgetId };
};

const createCommand = (ownerId: string, budgetId: string, key: string, profileCode = 'BO_INSPIRED_A') => ({
  ownerId, budgetId, profileCode, fixtureVersion: '2026-01', seed: 'postgres-seed',
  idempotencyKey: key, actorId: ownerId, requestId: `${key}-request`, clock: () => 1_700_000_000_000,
});

const financialSnapshot = async (ownerId: string, budgetId: string) => {
  const state = await new FinancialStore(prisma!).load(ownerId, budgetId);
  return {
    budget: await prisma!.budget.findUnique({ where: { id: budgetId }, select: { id: true, ownerId: true, setupStep: true, timezone: true, updatedAt: true } }),
    financialEvents: await prisma!.financialEvent.count({ where: { budgetId } }),
    transfers: await prisma!.transfer.count({ where: { budgetId } }),
    commandReceipts: await prisma!.commandReceipt.count({ where: { budgetId } }),
    accounts: await prisma!.account.count({ where: { budgetId } }),
    categories: await prisma!.category.count({ where: { budgetId } }),
    openingBalances: await prisma!.openingBalance.count({ where: { account: { budgetId } } }),
    budgetMonths: await prisma!.budgetMonth.count({ where: { budgetId } }),
    report: new ReportService().read(state, '2026-01'),
    csv: new TextDecoder().decode(serializeTransactionCsv(state.rawEvents ?? state.events, state.transfers ?? [])),
  };
};

const normalizeProjection = (projection: any) => {
  const normalizeRun = ({ state, cursor, revision, processedRecordCount, commandCount, attemptCount, profileCode, fixtureVersion, seed, scenarioKey }: any) => ({ state, cursor, revision, processedRecordCount, commandCount, attemptCount, profileCode, fixtureVersion, seed, scenarioKey });
  const normalizeCandidate = (candidate: any) => ({
    status: candidate.status, sourceRecordId: candidate.sourceRecordId, businessDate: candidate.businessDate, amountMinor: candidate.amountMinor, payee: candidate.payee, memo: candidate.memo,
    provenance: { profileCode: candidate.provenance.profileCode, fixtureVersion: candidate.provenance.fixtureVersion, seed: candidate.provenance.seed, sourceRecordId: candidate.provenance.sourceRecordId, deliveryOrdinal: candidate.provenance.deliveryOrdinal, batchIndex: candidate.provenance.batchIndex },
    lifecycle: candidate.lifecycle.map((entry: any) => ({ sequence: entry.sequence, priorStatus: entry.priorStatus, status: entry.status })),
  });
  return {
    run: normalizeRun(projection.run),
    candidates: projection.candidates.map(normalizeCandidate),
    checkpoints: projection.checkpoints.map((checkpoint: any) => ({ sequence: checkpoint.sequence, cursor: checkpoint.cursor, state: checkpoint.state, processedRecordCount: checkpoint.processedRecordCount })),
    audits: projection.audits.map((audit: any) => ({ command: audit.command, priorState: audit.priorState, resultingState: audit.resultingState, outcome: audit.outcome, diagnostic: audit.diagnostic })),
  };
};

test('PostgreSQL store commits owner-scoped simulation state and replays receipts', { skip: !postgresEnabled }, async () => {
  const { ownerId, budgetId } = await createFixture();
  try {
    const store = new PrismaSimulationStore(prisma!);
    const created = await store.createRun(createCommand(ownerId, budgetId, 'create-1'));
    const started = await store.execute({ ...createCommand(ownerId, budgetId, 'start-1'), runId: created.run.runId, command: 'START', expectedRevision: 0 });
    const replay = await store.execute({ ...createCommand(ownerId, budgetId, 'start-1'), runId: created.run.runId, command: 'START', expectedRevision: 0 });
    assert.deepEqual(replay, started);
    await assert.rejects(() => store.execute({ ...createCommand(ownerId, budgetId, 'start-1'), runId: created.run.runId, command: 'ADVANCE', expectedRevision: 0 }), (error: unknown) => error instanceof SimulationPersistenceError && error.code === 'CONFLICT');
    await assert.rejects(() => store.loadRun({ ownerId: randomUUID(), budgetId, runId: created.run.runId! }), (error: unknown) => error instanceof SimulationPersistenceError && error.code === 'NOT_FOUND');
    assert.equal(await prisma!.simulationAttempt.count({ where: { budgetId } }), 1);
    assert.equal(await prisma!.simulationCommandReceipt.count({ where: { budgetId } }), 2);
  } finally { await cleanup(budgetId, ownerId); }
});

test('PostgreSQL simulation commands remain financially neutral across failure, replay, and rebuild', { skip: !postgresEnabled }, async () => {
  const { ownerId, budgetId } = await createFixture();
  try {
    const store = new PrismaSimulationStore(prisma!);
    const before = await financialSnapshot(ownerId, budgetId);
    const created = await store.createRun(createCommand(ownerId, budgetId, 'neutral-create'));
    const started = await store.execute({ ...createCommand(ownerId, budgetId, 'neutral-start'), runId: created.run.runId, command: 'START', expectedRevision: 0 });
    const lostResponse = await store.execute({ ...createCommand(ownerId, budgetId, 'neutral-advance'), runId: created.run.runId, command: 'ADVANCE', expectedRevision: started.simulationRevision });
    const replay = await store.execute({ ...createCommand(ownerId, budgetId, 'neutral-advance'), runId: created.run.runId, command: 'ADVANCE', expectedRevision: started.simulationRevision });
    assert.deepEqual(replay, lostResponse);

    const memory = new InMemorySimulationStore([{ ownerId, budgetId }]);
    const memoryCreated = await memory.createRun(createCommand(ownerId, budgetId, 'normalized-memory-create'));
    let memoryRevision = memoryCreated.simulationRevision;
    let durableRevision = lostResponse.simulationRevision;
    for (const [index, command] of (['ADVANCE', 'ADVANCE'] as const).entries()) {
      memoryRevision = (await memory.execute({ ...createCommand(ownerId, budgetId, `normalized-memory-${index}`), runId: memoryCreated.run.runId, command, expectedRevision: memoryRevision })).simulationRevision;
      durableRevision = (await store.execute({ ...createCommand(ownerId, budgetId, `neutral-more-${index}`), runId: created.run.runId, command, expectedRevision: durableRevision })).simulationRevision;
    }
    const durableProjection = {
      run: await store.loadRun({ ownerId, budgetId, runId: created.run.runId! }),
      candidates: await store.listCandidates({ ownerId, budgetId, runId: created.run.runId! }),
      checkpoints: await store.listCheckpoints({ ownerId, budgetId, runId: created.run.runId! }),
      audits: await store.listAudit({ ownerId, budgetId, runId: created.run.runId! }),
    };
    const memoryProjection = {
      run: await memory.loadRun({ ownerId, budgetId, runId: memoryCreated.run.runId! }),
      candidates: await memory.listCandidates({ ownerId, budgetId, runId: memoryCreated.run.runId! }),
      checkpoints: await memory.listCheckpoints({ ownerId, budgetId, runId: memoryCreated.run.runId! }),
      audits: await memory.listAudit({ ownerId, budgetId, runId: memoryCreated.run.runId! }),
    };
    assert.equal(durableRevision, memoryRevision);
    assert.deepEqual(normalizeProjection(durableProjection), normalizeProjection(memoryProjection));

    const failedCreated = await store.createRun(createCommand(ownerId, budgetId, 'neutral-failed-create', 'BO_INSPIRED_B'));
    let revision = failedCreated.simulationRevision;
    for (const [index, command] of (['START', 'ADVANCE', 'ADVANCE', 'ADVANCE'] as const).entries()) {
      revision = (await store.execute({ ...createCommand(ownerId, budgetId, `neutral-failed-${index}`), runId: failedCreated.run.runId, command, expectedRevision: revision })).simulationRevision;
    }
    const failed = await store.loadRun({ ownerId, budgetId, runId: failedCreated.run.runId! });
    assert.equal(failed.state, 'FAILED');
    assert.ok((await store.listCandidates({ ownerId, budgetId, runId: failedCreated.run.runId! })).length >= 1);
    assert.deepEqual(await financialSnapshot(ownerId, budgetId), before);

    const projectionBeforeRebuild = {
      run: await store.loadRun({ ownerId, budgetId, runId: failedCreated.run.runId! }),
      candidates: await store.listCandidates({ ownerId, budgetId, runId: failedCreated.run.runId! }),
      checkpoints: await store.listCheckpoints({ ownerId, budgetId, runId: failedCreated.run.runId! }),
      audits: await store.listAudit({ ownerId, budgetId, runId: failedCreated.run.runId! }),
    };
    const { PrismaClient } = await import('@prisma/client');
    const rebuiltClient = new PrismaClient();
    try {
      const rebuilt = new PrismaSimulationStore(rebuiltClient);
      assert.deepEqual({
        run: await rebuilt.loadRun({ ownerId, budgetId, runId: failedCreated.run.runId! }),
        candidates: await rebuilt.listCandidates({ ownerId, budgetId, runId: failedCreated.run.runId! }),
        checkpoints: await rebuilt.listCheckpoints({ ownerId, budgetId, runId: failedCreated.run.runId! }),
        audits: await rebuilt.listAudit({ ownerId, budgetId, runId: failedCreated.run.runId! }),
      }, projectionBeforeRebuild);
      assert.deepEqual(await financialSnapshot(ownerId, budgetId), before);
    } finally { await rebuiltClient.$disconnect(); }
  } finally { await cleanup(budgetId, ownerId); }
});

test('PostgreSQL restart/rebuild preserves exact isolated rows and financial version', { skip: !postgresEnabled }, async () => {
  const { ownerId, budgetId } = await createFixture();
  try {
    const store = new PrismaSimulationStore(prisma!);
    const created = await store.createRun(createCommand(ownerId, budgetId, 'rebuild-create'));
    let revision = created.simulationRevision;
    for (const [index, command] of (['START', 'ADVANCE', 'ADVANCE', 'ADVANCE'] as const).entries()) {
      revision = (await store.execute({ ...createCommand(ownerId, budgetId, `rebuild-${index}`), runId: created.run.runId, command, expectedRevision: revision })).simulationRevision;
    }
    const before = {
      run: await store.loadRun({ ownerId, budgetId, runId: created.run.runId }),
      candidates: await store.listCandidates({ ownerId, budgetId, runId: created.run.runId }),
      checkpoints: await store.listCheckpoints({ ownerId, budgetId, runId: created.run.runId }),
      audits: await store.listAudit({ ownerId, budgetId, runId: created.run.runId }),
      attempts: await prisma!.simulationAttempt.findMany({ where: { budgetId }, orderBy: { sequence: 'asc' }, select: { id: true, sequence: true, outcome: true } }),
      receipts: await prisma!.simulationCommandReceipt.count({ where: { budgetId } }),
      financialVersion: await prisma!.commandReceipt.count({ where: { budgetId } }),
    };
    await prisma!.$disconnect();
    const { PrismaClient } = await import('@prisma/client');
    const restartedClient = new PrismaClient();
    try {
      const restarted = new PrismaSimulationStore(restartedClient);
      assert.deepEqual({
        run: await restarted.loadRun({ ownerId, budgetId, runId: created.run.runId }),
        candidates: await restarted.listCandidates({ ownerId, budgetId, runId: created.run.runId }),
        checkpoints: await restarted.listCheckpoints({ ownerId, budgetId, runId: created.run.runId }),
        audits: await restarted.listAudit({ ownerId, budgetId, runId: created.run.runId }),
      }, { run: before.run, candidates: before.candidates, checkpoints: before.checkpoints, audits: before.audits });
      assert.equal(await restartedClient.simulationAttempt.count({ where: { budgetId } }), before.attempts.length);
      assert.equal(await restartedClient.simulationCommandReceipt.count({ where: { budgetId } }), before.receipts);
      assert.equal(await restartedClient.commandReceipt.count({ where: { budgetId } }), before.financialVersion);
    } finally { await restartedClient.$disconnect(); }
  } finally {
    if (prisma) { const { PrismaClient } = await import('@prisma/client'); const cleanupClient = new PrismaClient(); try { await cleanupClient.$executeRaw`DELETE FROM "SimulationCommandReceipt" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationCandidateEvent" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationCandidate" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulatedRecord" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationCheckpoint" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationAttempt" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationAuditEntry" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationRun" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "SimulationScope" WHERE "budgetId" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "Budget" WHERE "id" = ${budgetId}::uuid`; await cleanupClient.$executeRaw`DELETE FROM "User" WHERE "id" = ${ownerId}::uuid`; } finally { await cleanupClient.$disconnect(); } }
  }
});

test('PostgreSQL simulation transactions roll back atomically and serialize competing revisions', { skip: !postgresEnabled }, async () => {
  const { ownerId, budgetId } = await createFixture();
  try {
    const failing = new PrismaSimulationStore(prisma!, { beforeCommit: () => { throw new Error('injected persistence failure'); } });
    await assert.rejects(() => failing.createRun(createCommand(ownerId, budgetId, 'rollback-create')));
    assert.equal(await prisma!.simulationRun.count({ where: { budgetId } }), 0);
    assert.equal(await prisma!.simulationAttempt.count({ where: { budgetId } }), 0);
    assert.equal(await prisma!.simulationCheckpoint.count({ where: { budgetId } }), 0);
    assert.equal(await prisma!.simulationAuditEntry.count({ where: { budgetId } }), 0);
    assert.equal(await prisma!.simulationCommandReceipt.count({ where: { budgetId } }), 0);

    const { PrismaClient } = await import('@prisma/client');
    const secondClient = new PrismaClient();
    try {
      const first = new PrismaSimulationStore(prisma!);
      const second = new PrismaSimulationStore(secondClient);
      const created = await first.createRun(createCommand(ownerId, budgetId, 'atomic-create'));
      const attempt = (promise: Promise<unknown>) => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
      const outcomes = await Promise.all([
        attempt(first.execute({ ...createCommand(ownerId, budgetId, 'concurrent-a'), runId: created.run.runId, command: 'START', expectedRevision: 0 })),
        attempt(second.execute({ ...createCommand(ownerId, budgetId, 'concurrent-b'), runId: created.run.runId, command: 'START', expectedRevision: 0 })),
      ]);
      assert.equal(outcomes.filter(outcome => outcome.ok).length, 1);
      assert.equal(outcomes.filter(outcome => !outcome.ok).length, 1);
      assert.equal(await prisma!.simulationAttempt.count({ where: { budgetId } }), 1);
      assert.equal(await prisma!.simulationAuditEntry.count({ where: { budgetId } }), 2);
      assert.equal(await prisma!.commandReceipt.count({ where: { budgetId } }), 0);
    } finally { await secondClient.$disconnect(); }
  } finally { await cleanup(budgetId, ownerId); }
});

after(async () => { if (prisma) await prisma.$disconnect(); });
