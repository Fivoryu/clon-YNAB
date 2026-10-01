import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const requirements = read('../../../docs/product/functional-requirements.md');
const scope = read('../../../docs/product/mvp-scope.md');
const actors = read('../../../docs/product/actors-and-use-cases.md');
const domain = read('../../../docs/architecture/domain-model.md');
const nonFunctional = read('../../../docs/product/non-functional-requirements.md');

test('functional requirements no longer describe scheduled transactions as deferred', () => {
  assert.match(requirements, /## FR-SCHEDULED — Scheduled and repeating transactions/);
  assert.doesNotMatch(requirements, /Name:\*\* Define deferred scheduled transactions/, 'the requirement is no longer titled as deferred');
  assert.doesNotMatch(requirements, /Scheduled entries are P2 and out of the first MVP/, 'scheduled entries are no longer out of the MVP');
  assert.match(requirements, /Delivered as a later slice/, 'the requirement records delivery');
});

test('functional requirements record the four resolved scheduling decisions', () => {
  assert.match(requirements, /dayOfMonth/, 'the recurrence shape is recorded');
  assert.match(requirements, /intervalMonths/, 'the recurrence interval is recorded');
  assert.match(requirements, /inclusive cut-off/, 'the generation timing is recorded as an explicit inclusive cut-off');
  assert.match(requirements, /There is no background job/, 'the explicit-command decision is recorded');
  assert.match(requirements, /Idempotency-Key/, 'the idempotency mechanism is recorded');
  assert.match(requirements, /sch:<scheduleId>:<YYYY-MM-DD>/, 'the occurrence identity format is recorded');
  assert.match(requirements, /uncleared/, 'the posting model is recorded');
  assert.match(requirements, /cash account/i, 'the cash-account exception is recorded');
});

test('runtime scope documents no longer defer scheduled and repeating transactions', () => {
  assert.doesNotMatch(scope, /scheduled and repeating transactions remain deferred/i, 'the scope no longer defers them');
  assert.doesNotMatch(scope, /scheduled and repeating transactions remain a later milestone/i, 'the milestone is no longer pending');
  assert.doesNotMatch(scope, /Scheduled and repeating transactions, including editing repetition \(deferred P2\)/, 'the exclusion list no longer defers them wholesale');
  assert.match(scope, /scheduled and repeating transactions were delivered/i, 'the scope records delivery');
});

test('the scope keeps the genuinely unresolved scheduling limitation open', () => {
  assert.match(scope, /editing repetition remains unsupported|editing a schedule remains unsupported|A schedule cannot be edited/i, 'editing a schedule is recorded as still unsupported');
});

test('the actor catalogue records the generator as delivered rather than deferred', () => {
  assert.doesNotMatch(actors, /\| Scheduler\/generation process \| Future process for recurring register items \| Deferred \|/, 'the generator actor is no longer deferred');
  assert.match(actors, /\| Scheduler\/generation process \|/, 'the actor is still catalogued');
});

test('the domain model records the generation policy as resolved', () => {
  assert.doesNotMatch(domain, /Define the exact generation timing, cash-account exception handling, and other generation policy before the deferred feature is implemented/, 'the generation policy is no longer an open question');
  assert.doesNotMatch(domain, /scheduled and repeating transactions remain deferred/, 'the domain model no longer defers them');
  assert.match(domain, /generation policy is resolved|resolved generation policy/i, 'the record states the policy is resolved');
});

test('no product or architecture document still describes scheduling as deferred', () => {
  const documents = { requirements, scope, actors, domain, nonFunctional };
  const forbidden: [RegExp, string][] = [
    [/Scheduling is deferred/i, 'a clone decision still defers scheduling'],
    [/scheduled (?:and repeating )?transactions? remain (?:deferred|a later milestone)/i, 'a summary still defers scheduling'],
    [/\*\*Reason deferred:\*\* Scheduling/i, 'a use case still records deferral as its reason'],
    [/scheduled generation[^.]*remains unresolved/i, 'an open question still defers generation identity'],
    [/scheduled occurrence cutoff[^.]*remain(?:s)? deferred/i, 'a timezone policy still defers the cutoff'],
  ];
  for (const [name, body] of Object.entries(documents)) {
    for (const [pattern, message] of forbidden) assert.doesNotMatch(body, pattern, `${name}: ${message}`);
  }
});

test('the delivery slices and the remaining open questions are stated honestly', () => {
  assert.match(scope, /Category targets, and scheduled and repeating transactions, were delivered in later slices/, 'the delivery slice records scheduled transactions as delivered');
  assert.match(domain, /Open question:\*\* Editing repetition, pausing a schedule, and weekly, annual, or custom cadences remain unsupported/, 'the domain model keeps the genuinely unresolved limitations open');
  assert.match(actors, /Editing repetition, pausing a schedule, and weekly, annual, or custom cadences remain unsupported/, 'the actor catalogue keeps the same limitations open');
});
