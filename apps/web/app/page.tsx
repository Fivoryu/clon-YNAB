'use client';

import { useState, type FormEvent } from 'react';

type Category = { id: string; name: string; archived: boolean };
type Budget = { id: string; setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE'; version: number; account: { name: string; openingBalanceMinor: number } | null; categories: Category[] };
type CategorySummary = Category & { carryoverMinor: number; assignedMinor: number; activityMinor: number; availableMinor: number };
type Summary = { month: string; accountBalanceMinor: number; rta: { amountMinor: number; releasedIncomeMinor: number; unreleasedIncomeMinor: number; priorCarryMinor: number; assignedMinor: number }; categories: CategorySummary[]; version: number };
type CommandResult = { id: string; version: number; amountMinor?: number; released?: boolean };

class RequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonth] = useState(currentMonth);
  const [opening, setOpening] = useState('');
  const [accountName, setAccountName] = useState('Cash');
  const [categoryNames, setCategoryNames] = useState('Bills, Food');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [spendingAmount, setSpendingAmount] = useState('');
  const [assignAmount, setAssignAmount] = useState('');
  const [unassignAmount, setUnassignAmount] = useState('');
  const [moveAmount, setMoveAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState('');
  const [spendingDate, setSpendingDate] = useState('');
  const [spendingCategoryId, setSpendingCategoryId] = useState('');
  const [assignCategoryId, setAssignCategoryId] = useState('');
  const [unassignCategoryId, setUnassignCategoryId] = useState('');
  const [moveSourceId, setMoveSourceId] = useState('');
  const [moveDestinationId, setMoveDestinationId] = useState('');
  const [latestIncome, setLatestIncome] = useState<CommandResult | null>(null);
  const [message, setMessage] = useState('');

  const call = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(url, { credentials: 'include', ...options });
    const result = await response.json() as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new RequestError(result.error?.message || 'Request failed', response.status);
    return result.data as T;
  };
  const command = (url: string, input: unknown) => call<CommandResult>(url, {
    method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget?.version ?? 0}"` }, body: JSON.stringify(input),
  });
  const refresh = async (targetMonth = month, targetBudget = budget) => {
    if (!targetBudget) return;
    const [dashboard, report] = await Promise.all([
      call<Summary>(`/api/v1/budgets/${targetBudget.id}/dashboard?month=${encodeURIComponent(targetMonth)}`),
      call<Summary>(`/api/v1/budgets/${targetBudget.id}/summary?month=${encodeURIComponent(targetMonth)}`),
    ]);
    setSummary(report || dashboard);
    setBudget(current => current ? { ...current, version: report.version } : current);
  };
  const adoptBudget = (next: Budget) => {
    setBudget(next);
    if (next.account) { setAccountName(next.account.name); setOpening(String(next.account.openingBalanceMinor)); }
    if (next.categories.length) setCategoryNames(next.categories.filter(category => !category.archived).map(category => category.name).join(', '));
  };
  const authenticate = async (event: FormEvent, action: 'register' | 'sign-in') => {
    event.preventDefault();
    try {
      await call(`/api/v1/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      setMessage(action === 'register' ? 'Account created. Sign in to continue.' : 'Signed in. Start or resume your budget setup.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed'); }
  };
  const startOrResume = async () => {
    try {
      const resumed = await call<Budget>('/api/v1/budgets');
      adoptBudget(resumed); setMessage('Budget setup resumed.');
    } catch (error) {
      if (!(error instanceof RequestError) || error.status !== 404) { setMessage(error instanceof Error ? error.message : 'Unable to load setup'); return; }
      try { adoptBudget(await call<Budget>('/api/v1/budgets', { method: 'POST' })); setMessage('Budget started. Complete setup to unlock budgeting.'); }
      catch (createError) { setMessage(createError instanceof Error ? createError.message : 'Unable to start setup'); }
    }
  };
  const saveSetup = async (event: FormEvent) => {
    event.preventDefault();
    if (!budget) return;
    try {
      const saved = await call<Budget>(`/api/v1/budgets/${budget.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ openingBalanceMinor: opening === '' ? undefined : Number(opening), accountName, accountType: 'checking', categories: categoryNames.split(',') }) });
      setBudget(saved); setMessage(saved.setupStep === 'COMPLETE' ? 'Setup complete. Your budget is ready.' : 'Setup saved. Resume when ready.');
      if (saved.setupStep === 'COMPLETE') await refresh(month, saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save setup'); }
  };
  const runCommand = async (work: () => Promise<CommandResult>, success: string) => {
    try { const result = await work(); setBudget(current => current ? { ...current, version: result.version } : current); setMessage(success); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update budget'); }
  };
  const recordIncome = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/income`, { amountMinor: Number(incomeAmount), ...(incomeDate ? { date: incomeDate } : {}) }).then(result => { setLatestIncome(result); return result; }), 'Income recorded. Release it explicitly before assigning it.'); };
  const releaseIncome = () => latestIncome && runCommand(() => command(`/api/v1/budgets/${budget!.id}/income/${latestIncome.id}/release`, {}), 'Income released and ready to assign.');
  const recordSpending = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/spending`, { amountMinor: Number(spendingAmount), categoryId: spendingCategoryId, ...(spendingDate ? { date: spendingDate } : {}) }), 'Spending recorded.'); };
  const assign = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations`, { categoryId: assignCategoryId, amountMinor: Number(assignAmount), month }), 'Money assigned.'); };
  const unassign = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations/unassign`, { categoryId: unassignCategoryId, amountMinor: Number(unassignAmount), month }), 'Money unassigned.'); };
  const move = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations/move`, { sourceCategoryId: moveSourceId, destinationCategoryId: moveDestinationId, amountMinor: Number(moveAmount), month }), 'Money moved.'); };
  const signOut = async () => { try { await call('/api/v1/auth/sign-out', { method: 'POST' }); setBudget(null); setSummary(null); setMessage('Signed out.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign out'); } };
  const activeCategories = budget?.categories.filter(category => !category.archived) ?? [];
  const categoryOptions = (label: string, value: string, onChange: (value: string) => void) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} required><option value="">Choose a category</option>{activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>;

  return <main>
    <header><p className="eyebrow">YNAB clone · bounded web slice</p><h1>Personal budget</h1><p>Plan this month with the values returned by your budget API.</p></header>
    <section className="card" aria-labelledby="account-heading"><h2 id="account-heading">Account</h2><form onSubmit={event => authenticate(event, 'sign-in')}><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required /><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required /><div className="actions"><button type="submit">Sign in</button><button type="button" className="secondary" onClick={event => authenticate(event as unknown as FormEvent, 'register')}>Create account</button></div></form><button type="button" className="link-button" onClick={startOrResume}>Start or resume setup</button></section>
    {message && <p className="status" role="status" aria-live="polite">{message}</p>}
    {budget && <section className="card" aria-labelledby="setup-heading"><h2 id="setup-heading">Budget setup</h2><p>Current setup step: <strong>{budget.setupStep}</strong></p><form onSubmit={saveSetup}><label htmlFor="account-name">Account name</label><input id="account-name" value={accountName} onChange={event => setAccountName(event.target.value)} /><label htmlFor="opening-balance">Opening balance (minor units)</label><input id="opening-balance" inputMode="numeric" type="number" value={opening} onChange={event => setOpening(event.target.value)} /><label htmlFor="categories">Categories (comma separated)</label><input id="categories" value={categoryNames} onChange={event => setCategoryNames(event.target.value)} /><button type="submit">Save and complete setup</button></form><p>{activeCategories.length} active categories</p></section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="dashboard-heading"><div className="section-heading"><div><h2 id="dashboard-heading">Dashboard</h2><p>Server-reported month summary.</p></div><button type="button" onClick={() => refresh()}>Load dashboard</button></div><label htmlFor="month">Budget month</label><input id="month" type="month" value={month} onChange={event => setMonth(event.target.value)} /><button type="button" className="secondary" onClick={() => refresh(month)}>Load month summary</button>{summary && <div className="summary" aria-label="Month summary"><h3>Month summary · {summary.month}</h3><dl><div><dt>Account balance</dt><dd>{summary.accountBalanceMinor} minor units</dd></div><div><dt>Ready to assign</dt><dd>{summary.rta.amountMinor} minor units</dd></div><div><dt>Released income</dt><dd>{summary.rta.releasedIncomeMinor} minor units</dd></div><div><dt>Unreleased income</dt><dd>{summary.rta.unreleasedIncomeMinor} minor units</dd></div></dl><h3>Categories</h3><ul className="category-list">{summary.categories.filter(category => !category.archived).map(category => <li key={category.id}><strong>{category.name}</strong><span>Assigned: {category.assignedMinor} · Available: {category.availableMinor} · Activity: {category.activityMinor}</span></li>)}</ul></div>}</section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="activity-heading"><h2 id="activity-heading">Budget activity</h2><p className="muted">Amounts are entered as positive minor units. Each change uses the API version and an idempotency key.</p><div className="forms"><form onSubmit={recordIncome}><h3>Record income</h3><label htmlFor="income-amount">Amount (minor units)</label><input id="income-amount" type="number" min="1" value={incomeAmount} onChange={event => setIncomeAmount(event.target.value)} required /><label htmlFor="income-date">Date</label><input id="income-date" type="date" value={incomeDate} onChange={event => setIncomeDate(event.target.value)} /><button type="submit">Record income</button>{latestIncome && <button type="button" className="secondary" onClick={releaseIncome}>Release income</button>}</form><form onSubmit={recordSpending}><h3>Record spending</h3><label htmlFor="spending-amount">Amount (minor units)</label><input id="spending-amount" type="number" min="1" value={spendingAmount} onChange={event => setSpendingAmount(event.target.value)} required />{categoryOptions('Spending category', spendingCategoryId, setSpendingCategoryId)}<button type="submit">Record spending</button></form><form onSubmit={assign}><h3>Assign</h3><label htmlFor="assign-amount">Amount (minor units)</label><input id="assign-amount" type="number" min="1" value={assignAmount} onChange={event => setAssignAmount(event.target.value)} required />{categoryOptions('Assignment category', assignCategoryId, setAssignCategoryId)}<button type="submit">Assign money</button></form><form onSubmit={unassign}><h3>Unassign</h3><label htmlFor="unassign-amount">Amount (minor units)</label><input id="unassign-amount" type="number" min="1" value={unassignAmount} onChange={event => setUnassignAmount(event.target.value)} required />{categoryOptions('Unassignment category', unassignCategoryId, setUnassignCategoryId)}<button type="submit">Unassign money</button></form><form onSubmit={move}><h3>Move</h3><label htmlFor="move-amount">Amount (minor units)</label><input id="move-amount" type="number" min="1" value={moveAmount} onChange={event => setMoveAmount(event.target.value)} required />{categoryOptions('Move source category', moveSourceId, setMoveSourceId)}{categoryOptions('Move destination category', moveDestinationId, setMoveDestinationId)}<button type="submit">Move money</button></form></div></section>}
    <button type="button" className="secondary sign-out" onClick={signOut}>Sign out</button>
  </main>;
}
