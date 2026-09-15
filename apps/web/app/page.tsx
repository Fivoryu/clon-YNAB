'use client';

import { useState, type FormEvent } from 'react';

type Category = { id: string; name: string; archived: boolean };
type Account = { id: string; name: string; kind: 'CASH' | 'CHECKING'; archived: boolean; openingBalanceMinor: number; balanceMinor: number };
type Budget = { id: string; setupStep: 'ACCOUNT' | 'CATEGORIES' | 'COMPLETE'; version: number; accounts: Account[]; accountBalanceMinor: number; account: Account | null; categories: Category[] };
type CategorySummary = Category & { carryoverMinor: number; assignedMinor: number; activityMinor: number; availableMinor: number };
type Summary = { month: string; accountBalanceMinor: number; accounts: Account[]; rta: { amountMinor: number; releasedIncomeMinor: number; unreleasedIncomeMinor: number; priorCarryMinor: number; assignedMinor: number }; categories: CategorySummary[]; version: number };
type CommandResult = { id?: string; transferId?: string; version: number; amountMinor?: number; released?: boolean; payee?: string | null; memo?: string | null };
type CsvDiagnostic = { row: number; field: string; code: string; message: string };
type CsvImportResult = { rows: number; accepted: number; rejected: number; diagnostics: CsvDiagnostic[]; diagnosticsTruncated: boolean; version: number };
type HistoryItem = { transactionId: string; kind: 'INCOME' | 'SPENDING'; date: string; amountMinor: number; category?: Category | null; payee: string | null; memo: string | null; state: 'ELIGIBLE' | 'PROTECTED'; accountId?: string } | { transactionId: string; kind: 'TRANSFER'; date: string; amountMinor: number; payee: string | null; memo: string | null; sourceAccount: Pick<Account, 'id' | 'name' | 'kind' | 'archived'>; destinationAccount: Pick<Account, 'id' | 'name' | 'kind' | 'archived'>; createdAt: string };
    type HistoryResponse = { items: HistoryItem[]; version: number };
    type HistoryKind = '' | 'INCOME' | 'SPENDING' | 'TRANSFER';
    type HistoryMutation = { version: number; item?: HistoryItem; deleted?: boolean };

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
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountKind, setNewAccountKind] = useState<'cash' | 'checking'>('cash');
  const [newAccountOpening, setNewAccountOpening] = useState('');
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState('');
      const [transferPayee, setTransferPayee] = useState('');
      const [transferMemo, setTransferMemo] = useState('');
  const [categoryNames, setCategoryNames] = useState('Bills, Food');
  const [incomeAmount, setIncomeAmount] = useState('');
      const [incomePayee, setIncomePayee] = useState('');
      const [incomeMemo, setIncomeMemo] = useState('');
  const [spendingAmount, setSpendingAmount] = useState('');
      const [spendingPayee, setSpendingPayee] = useState('');
      const [spendingMemo, setSpendingMemo] = useState('');
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
    const [history, setHistory] = useState<HistoryResponse | null>(null);
    const [historyMonth, setHistoryMonth] = useState('');
        const [historyAccount, setHistoryAccount] = useState('');
        const [historyKind, setHistoryKind] = useState<HistoryKind>('');
        const [historyCategory, setHistoryCategory] = useState('');
        const [historyFrom, setHistoryFrom] = useState('');
        const [historyTo, setHistoryTo] = useState('');
        const [historyQuery, setHistoryQuery] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editDate, setEditDate] = useState('');
    const [editCategory, setEditCategory] = useState('');
        const [editPayee, setEditPayee] = useState('');
        const [editMemo, setEditMemo] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [accountFormOpen, setAccountFormOpen] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvDiagnostics, setCsvDiagnostics] = useState<CsvDiagnostic[]>([]);

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
    const [dashboard, report, latest] = await Promise.all([
      call<Summary>(`/api/v1/budgets/${targetBudget.id}/dashboard?month=${encodeURIComponent(targetMonth)}`),
      call<Summary>(`/api/v1/budgets/${targetBudget.id}/summary?month=${encodeURIComponent(targetMonth)}`),
      call<Budget>(`/api/v1/budgets/${targetBudget.id}`),
    ]);
    setSummary(report || dashboard);
    setBudget(latest);
    setSelectedAccountId(current => current || latest.account?.id || '');
  };
  const adoptBudget = (next: Budget) => {
    setBudget(next);
    setSelectedAccountId(next.account?.id || next.accounts[0]?.id || '');
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
  const recordIncome = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/income`, { amountMinor: Number(incomeAmount), ...(selectedAccountId ? { accountId: selectedAccountId } : {}), ...(incomeDate ? { date: incomeDate } : {}), payee: incomePayee || null, memo: incomeMemo || null }).then(result => { setLatestIncome(result); return result; }), 'Income recorded. Release it explicitly before assigning it.'); };
  const releaseIncome = () => latestIncome && runCommand(() => command(`/api/v1/budgets/${budget!.id}/income/${latestIncome.id}/release`, {}), 'Income released and ready to assign.');
  const recordSpending = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/spending`, { amountMinor: Number(spendingAmount), categoryId: spendingCategoryId, ...(selectedAccountId ? { accountId: selectedAccountId } : {}), ...(spendingDate ? { date: spendingDate } : {}), payee: spendingPayee || null, memo: spendingMemo || null }), 'Spending recorded.'); };
  const assign = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations`, { categoryId: assignCategoryId, amountMinor: Number(assignAmount), month }), 'Money assigned.'); };
  const unassign = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations/unassign`, { categoryId: unassignCategoryId, amountMinor: Number(unassignAmount), month }), 'Money unassigned.'); };
  const move = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/allocations/move`, { sourceCategoryId: moveSourceId, destinationCategoryId: moveDestinationId, amountMinor: Number(moveAmount), month }), 'Money moved.'); };
  const createAccount = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/accounts`, { name: newAccountName, kind: newAccountKind, ...(newAccountOpening ? { openingBalanceMinor: Number(newAccountOpening) } : {}) }), 'Account created.').then(() => { setNewAccountName(''); setNewAccountOpening(''); setAccountFormOpen(false); }); };
  const archiveAccount = (account: Account) => runCommand(() => command(`/api/v1/budgets/${budget!.id}/accounts/${account.id}/archive`, {}), 'Account archived.');
  const recordTransfer = (event: FormEvent) => { event.preventDefault(); runCommand(() => command(`/api/v1/budgets/${budget!.id}/transfers`, { sourceAccountId: transferSourceId, destinationAccountId: transferDestinationId, amountMinor: Number(transferAmount), date: transferDate, payee: transferPayee || null, memo: transferMemo || null }), 'Transfer recorded.'); };
  const exportCsv = async () => {
    if (!budget) return;
    try {
      const response = await fetch(`/api/v1/budgets/${budget.id}/transactions/export`, { credentials: 'include' });
      if (!response.ok) { const result = await response.json() as { error?: { message?: string } }; throw new RequestError(result.error?.message || 'CSV export failed', response.status); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'transactions.csv'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage('CSV exported.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to export CSV'); }
  };
  const importCsv = async (event: FormEvent) => {
    event.preventDefault(); if (!budget || !csvFile) return;
    if (csvFile.size > 10_485_760) { setCsvDiagnostics([{ row: 0, field: 'file', code: 'FILE_TOO_LARGE', message: 'CSV must not exceed 10 MiB' }]); setMessage('CSV is too large.'); return; }
    try {
      const response = await fetch(`/api/v1/budgets/${budget.id}/transactions/import`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'text/csv; charset=utf-8', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` }, body: csvFile });
      const result = await response.json() as { data?: CsvImportResult; error?: { message?: string; details?: { diagnostics?: CsvDiagnostic[] } } };
      if (!response.ok) { setCsvDiagnostics(result.error?.details?.diagnostics ?? []); throw new RequestError(result.error?.message || 'CSV import failed', response.status); }
      const imported = result.data!; setCsvDiagnostics(imported.diagnostics); setBudget(current => current ? { ...current, version: imported.version } : current); setMessage(`Imported ${imported.accepted} CSV rows.`); setCsvFile(null); await refresh(); await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to import CSV'); }
  };
  const signOut = async () => { try { await call('/api/v1/auth/sign-out', { method: 'POST' }); setBudget(null); setSummary(null); setHistory(null); setCsvFile(null); setCsvDiagnostics([]); setMessage('Signed out.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign out'); } };
  const activeCategories = budget?.categories.filter(category => !category.archived) ?? [];
  const activeAccounts = budget?.accounts.filter(account => !account.archived) ?? [];
  const loadHistory = async (targetMonth = historyMonth) => {
    if (!budget) return;
    try {
      const params = new URLSearchParams();
          for (const [key, value] of [['month', targetMonth], ['account', historyAccount], ['kind', historyKind], ['category', historyCategory], ['from', historyFrom], ['to', historyTo], ['q', historyQuery]]) if (value) params.set(key, value);
          const result = await call<HistoryResponse>(`/api/v1/budgets/${budget.id}/transactions${params.toString() ? `?${params}` : ''}`);
      setHistory(result); setBudget(current => current ? { ...current, version: result.version } : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load transaction history'); }
  };
  const beginHistoryEdit = (item: HistoryItem) => { setEditingId(item.transactionId); setEditAmount(String(item.amountMinor)); setEditDate(item.date); setEditCategory(''); setEditPayee(item.payee); setEditMemo(item.memo); setDeletingId(null); };
  const saveHistoryEdit = async (event: FormEvent, item: HistoryItem) => {
    event.preventDefault(); if (!budget) return;
    try {
      const result = await call<HistoryMutation>(`/api/v1/budgets/${budget.id}/transactions/${item.transactionId}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` }, body: JSON.stringify({ amountMinor: Number(editAmount), date: editDate, payee: editPayee || null, memo: editMemo || null, ...(item.kind === 'SPENDING' && editCategory ? { categoryId: editCategory } : {}) }) });
      setBudget(current => current ? { ...current, version: result.version } : current); setEditingId(null); setMessage('Transaction updated.'); await refresh(month); await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update transaction'); }
  };
  const confirmHistoryDelete = async (event: FormEvent, item: HistoryItem) => {
    event.preventDefault(); if (!budget) return;
    try {
      const result = await call<HistoryMutation>(`/api/v1/budgets/${budget.id}/transactions/${item.transactionId}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'If-Match': `W/"${budget.version}"` }, body: JSON.stringify({ confirmed: true, ...(deleteReason ? { reason: deleteReason } : {}) }) });
      setBudget(current => current ? { ...current, version: result.version } : current); setDeletingId(null); setDeleteReason(''); setMessage('Transaction deleted.'); await refresh(month); await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to delete transaction'); }
  };
  const categoryOptions = (label: string, value: string, onChange: (value: string) => void) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} required><option value="">Choose a category</option>{activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>;

  return <main>
    <header><p className="eyebrow">YNAB clone · bounded web slice</p><h1>Personal budget</h1><p>Plan this month with the values returned by your budget API.</p></header>
    <section className="card" aria-labelledby="account-heading"><h2 id="account-heading">Account</h2><form onSubmit={event => authenticate(event, 'sign-in')}><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required /><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required /><div className="actions"><button type="submit">Sign in</button><button type="button" className="secondary" onClick={event => authenticate(event as unknown as FormEvent, 'register')}>Create account</button></div></form><button type="button" className="link-button" onClick={startOrResume}>Start or resume setup</button></section>
    {message && <p className="status" role="status" aria-live="polite">{message}</p>}
    {budget && <section className="card" aria-labelledby="setup-heading"><h2 id="setup-heading">Budget setup</h2><p>Current setup step: <strong>{budget.setupStep}</strong></p><form onSubmit={saveSetup}><label htmlFor="account-name">Account name</label><input id="account-name" value={accountName} onChange={event => setAccountName(event.target.value)} /><label htmlFor="opening-balance">Opening balance (minor units)</label><input id="opening-balance" inputMode="numeric" type="number" value={opening} onChange={event => setOpening(event.target.value)} /><label htmlFor="categories">Categories (comma separated)</label><input id="categories" value={categoryNames} onChange={event => setCategoryNames(event.target.value)} /><button type="submit">Save and complete setup</button></form><p>{activeCategories.length} active categories</p></section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="accounts-heading"><div className="section-heading"><h2 id="accounts-heading">Accounts</h2><button type="button" onClick={() => setAccountFormOpen(open => !open)}>{accountFormOpen ? 'Cancel account' : 'Create account'}</button></div>{accountFormOpen && <form onSubmit={createAccount}><label htmlFor="new-account-name">New account name</label><input id="new-account-name" value={newAccountName} onChange={event => setNewAccountName(event.target.value)} required /><label htmlFor="new-account-kind">New account kind</label><select id="new-account-kind" value={newAccountKind} onChange={event => setNewAccountKind(event.target.value as 'cash' | 'checking')}><option value="cash">Cash</option><option value="checking">Checking</option></select><label htmlFor="new-account-opening">Opening balance (minor units)</label><input id="new-account-opening" type="number" value={newAccountOpening} onChange={event => setNewAccountOpening(event.target.value)} /><button type="submit">Save account</button></form>}<ul aria-label="Accounts">{budget.accounts.map(account => <li key={account.id} data-testid={`account-${account.id}`}><strong>{account.name}</strong><span>{account.name} · {account.balanceMinor} minor units · {account.kind}{account.archived ? ' · Archived' : ''}</span>{!account.archived && <button type="button" className="secondary" onClick={() => archiveAccount(account)}>Archive</button>}</li>)}</ul></section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="dashboard-heading"><div className="section-heading"><div><h2 id="dashboard-heading">Dashboard</h2><p>Server-reported month summary.</p></div><button type="button" onClick={() => refresh()}>Load dashboard</button></div><label htmlFor="month">Budget month</label><input id="month" type="month" value={month} onChange={event => setMonth(event.target.value)} /><button type="button" className="secondary" onClick={() => refresh(month)}>Load month summary</button>{summary && <div className="summary" aria-label="Month summary"><h3>Month summary · {summary.month}</h3><dl><div><dt>Account balance</dt><dd>{summary.accountBalanceMinor} minor units</dd></div><div><dt>Ready to assign</dt><dd>{summary.rta.amountMinor} minor units</dd></div><div><dt>Released income</dt><dd>{summary.rta.releasedIncomeMinor} minor units</dd></div><div><dt>Unreleased income</dt><dd>{summary.rta.unreleasedIncomeMinor} minor units</dd></div></dl><h3>Categories</h3><ul className="category-list">{summary.categories.filter(category => !category.archived).map(category => <li key={category.id}><strong>{category.name}</strong><span>Assigned: {category.assignedMinor} · Available: {category.availableMinor} · Activity: {category.activityMinor}</span></li>)}</ul></div>}</section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="csv-heading"><div className="section-heading"><div><h2 id="csv-heading">CSV import and export</h2><p>Use the canonical seven-column CSV format. Import is atomic and limited to 10 MiB / 5,000 rows.</p></div><button type="button" onClick={exportCsv}>Download CSV</button></div><form onSubmit={importCsv}><label htmlFor="csv-file">CSV file</label><input id="csv-file" type="file" accept="text/csv,.csv" onChange={event => { setCsvFile(event.target.files?.[0] ?? null); setCsvDiagnostics([]); }} required /><button type="submit" disabled={!csvFile}>Import CSV</button></form>{csvDiagnostics.length > 0 && <ul aria-label="CSV diagnostics">{csvDiagnostics.map((item, index) => <li key={`${item.row}-${item.code}-${index}`}>Row {item.row || 'file'} · {item.field} · {item.code}: {item.message}</li>)}</ul>}</section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="history-heading"><div className="section-heading"><div><h2 id="history-heading">Transaction history</h2><p>Review supported history from the server.</p></div><button type="button" onClick={() => loadHistory()}>Load history</button></div><label htmlFor="history-month">History month (optional)</label><input id="history-month" type="month" value={historyMonth} onChange={event => setHistoryMonth(event.target.value)} /><label htmlFor="history-account">History account</label><select id="history-account" value={historyAccount} onChange={event => setHistoryAccount(event.target.value)}><option value="">All accounts</option>{budget.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><label htmlFor="history-kind">History kind</label><select id="history-kind" value={historyKind} onChange={event => setHistoryKind(event.target.value as HistoryKind)}><option value="">All kinds</option><option value="INCOME">Income</option><option value="SPENDING">Spending</option><option value="TRANSFER">Transfer</option></select><label htmlFor="history-category">History category</label><select id="history-category" value={historyCategory} onChange={event => setHistoryCategory(event.target.value)}><option value="">All categories</option>{activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label htmlFor="history-from">From date</label><input id="history-from" type="date" value={historyFrom} onChange={event => setHistoryFrom(event.target.value)} /><label htmlFor="history-to">To date</label><input id="history-to" type="date" value={historyTo} onChange={event => setHistoryTo(event.target.value)} /><label htmlFor="history-search">History search</label><input id="history-search" value={historyQuery} maxLength={200} onChange={event => setHistoryQuery(event.target.value)} /><button type="button" className="secondary" onClick={() => loadHistory(historyMonth)}>Filter history</button>{history && <ul aria-label="Transaction history">{history.items.map(item => <li key={item.transactionId} data-testid={`transaction-${item.transactionId}`}><strong>{item.kind === 'INCOME' ? 'Income' : item.kind === 'TRANSFER' ? 'Transfer' : 'Spending'}</strong><span>{item.date} · {item.amountMinor} minor units{item.kind === 'TRANSFER' ? ` · ${item.sourceAccount.name} → ${item.destinationAccount.name}` : item.category ? ` · ${item.category.name}${item.category.archived ? ' (archived)' : ''}` : ''}</span><small>{item.payee ? `Payee: ${item.payee}` : ''}{item.memo ? ` · Memo: ${item.memo}` : ''}</small>{item.kind === 'TRANSFER' ? <p>Transfer between accounts</p> : item.state === 'PROTECTED' ? <p>Protected · released income</p> : <div><button type="button" onClick={() => beginHistoryEdit(item)}>Edit</button><button type="button" className="secondary" onClick={() => { setDeletingId(item.transactionId); setEditingId(null); setDeleteReason(''); }}>Delete</button>{editingId === item.transactionId && <form onSubmit={event => saveHistoryEdit(event, item)}><label htmlFor={`history-amount-${item.transactionId}`}>Amount (minor units)</label><input id={`history-amount-${item.transactionId}`} type="number" min="1" value={editAmount} onChange={event => setEditAmount(event.target.value)} required /><label htmlFor={`history-date-${item.transactionId}`}>Date</label><input id={`history-date-${item.transactionId}`} type="date" value={editDate} onChange={event => setEditDate(event.target.value)} required /><label htmlFor={`history-payee-${item.transactionId}`}>Payee</label><input id={`history-payee-${item.transactionId}`} value={editPayee} onChange={event => setEditPayee(event.target.value)} /><label htmlFor={`history-memo-${item.transactionId}`}>Memo</label><textarea id={`history-memo-${item.transactionId}`} value={editMemo} onChange={event => setEditMemo(event.target.value)} />{item.kind === 'SPENDING' && <><label htmlFor={`history-category-${item.transactionId}`}>Category</label><select id={`history-category-${item.transactionId}`} aria-label="Category" value={editCategory} onChange={event => setEditCategory(event.target.value)}><option value="">Keep current category</option>{activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></>}<button type="submit">Save history edit</button><button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button></form>}{deletingId === item.transactionId && <form onSubmit={event => confirmHistoryDelete(event, item)}><label htmlFor={`delete-reason-${item.transactionId}`}>Delete reason (optional)</label><textarea id={`delete-reason-${item.transactionId}`} value={deleteReason} onChange={event => setDeleteReason(event.target.value)} /><button type="submit">Confirm delete</button><button type="button" className="secondary" onClick={() => setDeletingId(null)}>Cancel</button></form>}</div>}</li>)}</ul>}</section>}
    {budget?.setupStep === 'COMPLETE' && <section className="card" aria-labelledby="activity-heading"><h2 id="activity-heading">Budget activity</h2><p className="muted">Amounts are entered as positive minor units. Each change uses the API version and an idempotency key.</p><div className="forms"><form onSubmit={recordIncome}><h3>Record income</h3><label htmlFor="income-amount">Amount (minor units)</label><input id="income-amount" type="number" min="1" value={incomeAmount} onChange={event => setIncomeAmount(event.target.value)} required /><label htmlFor="income-payee">Payee</label><input id="income-payee" value={incomePayee} onChange={event => setIncomePayee(event.target.value)} /><label htmlFor="income-memo">Memo</label><textarea id="income-memo" value={incomeMemo} onChange={event => setIncomeMemo(event.target.value)} /><label htmlFor="income-account">Account</label><select id="income-account" aria-label="Income account" value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)}>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><label htmlFor="income-date">Date</label><input id="income-date" type="date" value={incomeDate} onChange={event => setIncomeDate(event.target.value)} /><button type="submit">Record income</button>{latestIncome && <button type="button" className="secondary" onClick={releaseIncome}>Release income</button>}</form><form onSubmit={recordSpending}><h3>Record spending</h3><label htmlFor="spending-amount">Amount (minor units)</label><input id="spending-amount" type="number" min="1" value={spendingAmount} onChange={event => setSpendingAmount(event.target.value)} required /><label htmlFor="spending-payee">Payee</label><input id="spending-payee" value={spendingPayee} onChange={event => setSpendingPayee(event.target.value)} /><label htmlFor="spending-memo">Memo</label><textarea id="spending-memo" value={spendingMemo} onChange={event => setSpendingMemo(event.target.value)} /><label htmlFor="spending-account">Account</label><select id="spending-account" aria-label="Spending account" value={selectedAccountId} onChange={event => setSelectedAccountId(event.target.value)}>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>{categoryOptions('Spending category', spendingCategoryId, setSpendingCategoryId)}<button type="submit">Record spending</button></form><form onSubmit={assign}><h3>Assign</h3><label htmlFor="assign-amount">Amount (minor units)</label><input id="assign-amount" type="number" min="1" value={assignAmount} onChange={event => setAssignAmount(event.target.value)} required />{categoryOptions('Assignment category', assignCategoryId, setAssignCategoryId)}<button type="submit">Assign money</button></form><form onSubmit={unassign}><h3>Unassign</h3><label htmlFor="unassign-amount">Amount (minor units)</label><input id="unassign-amount" type="number" min="1" value={unassignAmount} onChange={event => setUnassignAmount(event.target.value)} required />{categoryOptions('Unassignment category', unassignCategoryId, setUnassignCategoryId)}<button type="submit">Unassign money</button></form><form onSubmit={move}><h3>Move</h3><label htmlFor="move-amount">Amount (minor units)</label><input id="move-amount" type="number" min="1" value={moveAmount} onChange={event => setMoveAmount(event.target.value)} required />{categoryOptions('Move source category', moveSourceId, setMoveSourceId)}{categoryOptions('Move destination category', moveDestinationId, setMoveDestinationId)}<button type="submit">Move money</button></form><form onSubmit={recordTransfer}><h3>Transfer between accounts</h3><label htmlFor="transfer-source">Source account</label><select id="transfer-source" aria-label="Transfer source" value={transferSourceId} onChange={event => setTransferSourceId(event.target.value)} required><option value="">Choose a source</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><label htmlFor="transfer-destination">Destination account</label><select id="transfer-destination" aria-label="Transfer destination" value={transferDestinationId} onChange={event => setTransferDestinationId(event.target.value)} required><option value="">Choose a destination</option>{activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select><label htmlFor="transfer-amount">Transfer amount (minor units)</label><input id="transfer-amount" aria-label="Transfer amount (minor units)" type="number" min="1" value={transferAmount} onChange={event => setTransferAmount(event.target.value)} required /><label htmlFor="transfer-payee">Payee</label><input id="transfer-payee" value={transferPayee} onChange={event => setTransferPayee(event.target.value)} /><label htmlFor="transfer-memo">Memo</label><textarea id="transfer-memo" value={transferMemo} onChange={event => setTransferMemo(event.target.value)} /><label htmlFor="transfer-date">Transfer date</label><input id="transfer-date" type="date" value={transferDate} onChange={event => setTransferDate(event.target.value)} required /><button type="submit">Record transfer</button></form></div></section>}
    <button type="button" className="secondary sign-out" onClick={signOut}>Sign out</button>
  </main>;
}
