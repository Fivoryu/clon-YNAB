'use client';

import { useState, type ReactNode } from 'react';
import type { BudgetAppController } from '../hooks/useBudgetApp';
import type { HistoryItem, HistoryKind } from '../models';
import { WorkspaceNav, type WorkspaceSection } from './WorkspaceNav';

function CategorySelect({
  label,
  value,
  categories,
  onChange,
}: {
  label: string;
  value: string;
  categories: BudgetAppController['activeCategories'];
  onChange: (value: string) => void;
}) {
  return (
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} required>
      <option value="">Choose a category</option>
      {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select>
  );
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="section-heading section-heading-rich">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function BudgetWorkspace({ app }: { app: BudgetAppController }) {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const {
    budget, summary, month, setMonth, message, signOut, refresh, activeCategories, activeAccounts,
  } = app;

  if (!budget || budget.setupStep !== 'COMPLETE') return null;

  const suggestedAction: { title: string; text: string; section: WorkspaceSection; button: string } = !summary
    ? { title: 'Load your current month', text: 'Pull the latest balances and category amounts from the server before making changes.', section: 'overview', button: 'Refresh overview' }
    : app.latestIncome && summary.rta.unreleasedIncomeMinor > 0
      ? { title: 'Release your recorded income', text: 'That income is in your account but is not ready to assign yet.', section: 'activity', button: 'Go to activity' }
      : summary.rta.amountMinor > 0
        ? { title: 'Give available money a purpose', text: `You have ${summary.rta.amountMinor} minor units ready to assign across your categories.`, section: 'plan', button: 'Open planning' }
        : { title: 'Keep the plan current', text: 'Your available money is assigned. Record new income, spending, or transfers as they happen.', section: 'activity', button: 'Record activity' };

  const openSuggested = () => {
    if (suggestedAction.section === 'overview') void refresh();
    else setActiveSection(suggestedAction.section);
  };

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Personal budget</p>
          <h1>Your budget workspace</h1>
          <p className="lead">Focus on one part of your budget at a time. The server remains the source of truth for every balance.</p>
        </div>
        <button type="button" className="secondary compact" onClick={signOut}>Sign out</button>
      </header>

      <WorkspaceNav active={activeSection} onChange={setActiveSection} />
      {message && <p className="status" role="status" aria-live="polite">{message}</p>}

      <div className="workspace-content">
        {activeSection === 'overview' && (
          <section className="workspace-view" aria-labelledby="dashboard-heading">
            <div className="next-action">
              <div>
                <p className="section-kicker">Recommended now</p>
                <h2>{suggestedAction.title}</h2>
                <p>{suggestedAction.text}</p>
              </div>
              <button type="button" onClick={openSuggested}>{suggestedAction.button}</button>
            </div>

            <section className="card" aria-labelledby="dashboard-heading">
              <SectionHeader
                eyebrow="Current month"
                title="Dashboard"
                description="Check the month you are planning. These values are calculated by the API, not by the browser."
                action={<button type="button" onClick={() => refresh()}>Load dashboard</button>}
              />
              <div className="inline-control">
                <div>
                  <label htmlFor="month">Budget month</label>
                  <input id="month" type="month" value={month} onChange={event => setMonth(event.target.value)} />
                </div>
                <button type="button" className="secondary" onClick={() => refresh(month)}>Load month summary</button>
              </div>

              {summary ? (
                <div className="summary" aria-label="Month summary">
                  <h3>Month summary · {summary.month}</h3>
                  <dl>
                    <div><dt>Account balance</dt><dd>{summary.accountBalanceMinor} minor units</dd></div>
                    <div><dt>Ready to assign</dt><dd>{summary.rta.amountMinor} minor units</dd></div>
                    <div><dt>Released income</dt><dd>{summary.rta.releasedIncomeMinor} minor units</dd></div>
                    <div><dt>Unreleased income</dt><dd>{summary.rta.unreleasedIncomeMinor} minor units</dd></div>
                  </dl>
                  <div className="subsection-heading">
                    <div><p className="section-kicker">Plan health</p><h3>Categories</h3></div>
                    <button type="button" className="secondary compact" onClick={() => setActiveSection('plan')}>Manage plan</button>
                  </div>
                  <ul className="category-list">
                    {summary.categories.filter(category => !category.archived).map(category => (
                      <li key={category.id}>
                        <strong>{category.name}</strong>
                        <span>Assigned: {category.assignedMinor} · Available: {category.availableMinor} · Activity: {category.activityMinor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="empty-state"><strong>No month loaded yet.</strong><span>Load the dashboard to see your balances and category plan.</span></div>
              )}
            </section>
          </section>
        )}

        {activeSection === 'plan' && (
          <section className="workspace-view" aria-labelledby="plan-heading">
            <SectionHeader eyebrow="Planning" title="Plan your money" description="Assign money to a category, take it back to Ready to Assign, or move it between priorities." />
            {summary && <div className="context-banner"><span>Ready to assign</span><strong>{summary.rta.amountMinor} minor units</strong><span>Planning {month}</span></div>}
            <div className="forms forms-three">
              <form className="card action-card" onSubmit={app.assign}>
                <p className="section-kicker">Put money to work</p><h3>Assign</h3>
                <label htmlFor="assign-amount">Amount (minor units)</label>
                <input id="assign-amount" type="number" min="1" value={app.assignAmount} onChange={event => app.setAssignAmount(event.target.value)} required />
                <CategorySelect label="Assignment category" value={app.assignCategoryId} categories={activeCategories} onChange={app.setAssignCategoryId} />
                <button type="submit">Assign money</button>
              </form>

              <form className="card action-card" onSubmit={app.unassign}>
                <p className="section-kicker">Return flexibility</p><h3>Unassign</h3>
                <label htmlFor="unassign-amount">Amount (minor units)</label>
                <input id="unassign-amount" type="number" min="1" value={app.unassignAmount} onChange={event => app.setUnassignAmount(event.target.value)} required />
                <CategorySelect label="Unassignment category" value={app.unassignCategoryId} categories={activeCategories} onChange={app.setUnassignCategoryId} />
                <button type="submit">Unassign money</button>
              </form>

              <form className="card action-card" onSubmit={app.move}>
                <p className="section-kicker">Change priorities</p><h3>Move</h3>
                <label htmlFor="move-amount">Amount (minor units)</label>
                <input id="move-amount" type="number" min="1" value={app.moveAmount} onChange={event => app.setMoveAmount(event.target.value)} required />
                <CategorySelect label="Move source category" value={app.moveSourceId} categories={activeCategories} onChange={app.setMoveSourceId} />
                <CategorySelect label="Move destination category" value={app.moveDestinationId} categories={activeCategories} onChange={app.setMoveDestinationId} />
                <button type="submit">Move money</button>
              </form>
            </div>
          </section>
        )}

        {activeSection === 'activity' && (
          <section className="workspace-view" aria-labelledby="activity-heading">
            <SectionHeader eyebrow="Transactions" title="Budget activity" description="Record what happened to your money. Income and spending affect the plan; transfers only move money between accounts." />
            <div className="forms forms-three">
              <form className="card action-card" onSubmit={app.recordIncome}>
                <p className="section-kicker">Money in</p><h3>Record income</h3>
                <label htmlFor="income-amount">Amount (minor units)</label>
                <input id="income-amount" type="number" min="1" value={app.incomeAmount} onChange={event => app.setIncomeAmount(event.target.value)} required />
                <label htmlFor="income-payee">Payee</label>
                <input id="income-payee" value={app.incomePayee} onChange={event => app.setIncomePayee(event.target.value)} />
                <label htmlFor="income-memo">Memo</label>
                <textarea id="income-memo" value={app.incomeMemo} onChange={event => app.setIncomeMemo(event.target.value)} />
                <label htmlFor="income-account">Account</label>
                <select id="income-account" aria-label="Income account" value={app.selectedAccountId} onChange={event => app.setSelectedAccountId(event.target.value)}>
                  {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <label htmlFor="income-date">Date</label>
                <input id="income-date" type="date" value={app.incomeDate} onChange={event => app.setIncomeDate(event.target.value)} />
                <button type="submit">Record income</button>
                {app.latestIncome && <button type="button" className="secondary" onClick={() => void app.releaseIncome()}>Release income</button>}
              </form>

              <form className="card action-card" onSubmit={app.recordSpending}>
                <p className="section-kicker">Money out</p><h3>Record spending</h3>
                <label htmlFor="spending-amount">Amount (minor units)</label>
                <input id="spending-amount" type="number" min="1" value={app.spendingAmount} onChange={event => app.setSpendingAmount(event.target.value)} required />
                <label htmlFor="spending-payee">Payee</label>
                <input id="spending-payee" value={app.spendingPayee} onChange={event => app.setSpendingPayee(event.target.value)} />
                <label htmlFor="spending-memo">Memo</label>
                <textarea id="spending-memo" value={app.spendingMemo} onChange={event => app.setSpendingMemo(event.target.value)} />
                <label htmlFor="spending-account">Account</label>
                <select id="spending-account" aria-label="Spending account" value={app.selectedAccountId} onChange={event => app.setSelectedAccountId(event.target.value)}>
                  {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <label htmlFor="spending-date">Date</label>
                <input id="spending-date" type="date" value={app.spendingDate} onChange={event => app.setSpendingDate(event.target.value)} />
                <CategorySelect label="Spending category" value={app.spendingCategoryId} categories={activeCategories} onChange={app.setSpendingCategoryId} />
                <button type="submit">Record spending</button>
              </form>

              <form className="card action-card" onSubmit={app.recordTransfer}>
                <p className="section-kicker">Between accounts</p><h3>Transfer between accounts</h3>
                <label htmlFor="transfer-source">Source account</label>
                <select id="transfer-source" aria-label="Transfer source" value={app.transferSourceId} onChange={event => app.setTransferSourceId(event.target.value)} required>
                  <option value="">Choose a source</option>
                  {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <label htmlFor="transfer-destination">Destination account</label>
                <select id="transfer-destination" aria-label="Transfer destination" value={app.transferDestinationId} onChange={event => app.setTransferDestinationId(event.target.value)} required>
                  <option value="">Choose a destination</option>
                  {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <label htmlFor="transfer-amount">Transfer amount (minor units)</label>
                <input id="transfer-amount" aria-label="Transfer amount (minor units)" type="number" min="1" value={app.transferAmount} onChange={event => app.setTransferAmount(event.target.value)} required />
                <label htmlFor="transfer-payee">Payee</label>
                <input id="transfer-payee" value={app.transferPayee} onChange={event => app.setTransferPayee(event.target.value)} />
                <label htmlFor="transfer-memo">Memo</label>
                <textarea id="transfer-memo" value={app.transferMemo} onChange={event => app.setTransferMemo(event.target.value)} />
                <label htmlFor="transfer-date">Transfer date</label>
                <input id="transfer-date" type="date" value={app.transferDate} onChange={event => app.setTransferDate(event.target.value)} required />
                <button type="submit">Record transfer</button>
              </form>
            </div>
          </section>
        )}

        {activeSection === 'accounts' && (
          <section className="workspace-view card" aria-labelledby="accounts-heading" aria-label="Accounts">
            <SectionHeader
              eyebrow="Where money lives"
              title="Accounts"
              description="Add the cash and checking accounts you use. Archiving keeps history while preventing new activity."
              action={<button type="button" onClick={() => app.setAccountFormOpen(open => !open)}>{app.accountFormOpen ? 'Cancel account' : 'Create account'}</button>}
            />
            {app.accountFormOpen && (
              <form className="inline-form" onSubmit={app.createAccount}>
                <label htmlFor="new-account-name">New account name</label>
                <input id="new-account-name" value={app.newAccountName} onChange={event => app.setNewAccountName(event.target.value)} required />
                <label htmlFor="new-account-kind">New account kind</label>
                <select id="new-account-kind" value={app.newAccountKind} onChange={event => app.setNewAccountKind(event.target.value as 'cash' | 'checking')}>
                  <option value="cash">Cash</option><option value="checking">Checking</option>
                </select>
                <label htmlFor="new-account-opening">Opening balance (minor units)</label>
                <input id="new-account-opening" type="number" value={app.newAccountOpening} onChange={event => app.setNewAccountOpening(event.target.value)} />
                <button type="submit">Save account</button>
              </form>
            )}
            <ul className="account-list" aria-label="Accounts">
              {budget.accounts.map(account => (
                <li key={account.id} data-testid={`account-${account.id}`}>
                  <div><strong>{account.name}</strong><span>{account.name} · {account.balanceMinor} minor units · {account.kind}{account.archived ? ' · Archived' : ''}</span></div>
                  {!account.archived && <button type="button" className="secondary compact" onClick={() => void app.archiveAccount(account)}>Archive</button>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeSection === 'history' && (
          <section className="workspace-view card" aria-labelledby="history-heading" aria-label="Transaction history">
            <SectionHeader
              eyebrow="Audit trail"
              title="Transaction history"
              description="Search effective transactions, then correct or delete eligible income and spending records. Transfers stay read-only."
              action={<button type="button" onClick={() => void app.loadHistory()}>Load history</button>}
            />
            <div className="history-filters">
              <div><label htmlFor="history-month">History month (optional)</label><input id="history-month" type="month" value={app.historyMonth} onChange={event => app.setHistoryMonth(event.target.value)} /></div>
              <div><label htmlFor="history-account">History account</label><select id="history-account" value={app.historyAccount} onChange={event => app.setHistoryAccount(event.target.value)}><option value="">All accounts</option>{budget.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
              <div><label htmlFor="history-kind">History kind</label><select id="history-kind" value={app.historyKind} onChange={event => app.setHistoryKind(event.target.value as HistoryKind)}><option value="">All kinds</option><option value="INCOME">Income</option><option value="SPENDING">Spending</option><option value="TRANSFER">Transfer</option></select></div>
              <div><label htmlFor="history-category">History category</label><select id="history-category" value={app.historyCategory} onChange={event => app.setHistoryCategory(event.target.value)}><option value="">All categories</option>{activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div><label htmlFor="history-from">From date</label><input id="history-from" type="date" value={app.historyFrom} onChange={event => app.setHistoryFrom(event.target.value)} /></div>
              <div><label htmlFor="history-to">To date</label><input id="history-to" type="date" value={app.historyTo} onChange={event => app.setHistoryTo(event.target.value)} /></div>
              <div className="wide"><label htmlFor="history-search">History search</label><input id="history-search" value={app.historyQuery} maxLength={200} onChange={event => app.setHistoryQuery(event.target.value)} placeholder="Payee, memo, account, category…" /></div>
              <button type="button" className="secondary filter-button" onClick={() => void app.loadHistory(app.historyMonth)}>Filter history</button>
            </div>

            {app.history ? (
              app.history.items.length ? (
                <ul className="history-list" aria-label="Transaction history">
                  {app.history.items.map(item => <HistoryRow key={item.transactionId} app={app} item={item} />)}
                </ul>
              ) : <div className="empty-state"><strong>No matching transactions.</strong><span>Try changing or clearing the filters above.</span></div>
            ) : <div className="empty-state"><strong>History is ready when you need it.</strong><span>Load history to review the latest effective transactions.</span></div>}
          </section>
        )}

        {activeSection === 'data' && (
          <section className="workspace-view card" aria-labelledby="csv-heading" aria-label="CSV import and export">
            <SectionHeader
              eyebrow="Portable data"
              title="CSV import and export"
              description="Download canonical transaction data or import a validated seven-column CSV. Imports are atomic."
              action={<button type="button" onClick={app.exportCsv}>Download CSV</button>}
            />
            <div className="data-explainer">
              <div><strong>Canonical format</strong><span>date, type, account, amountMinor, category, payee, memo</span></div>
              <div><strong>Safety limits</strong><span>10 MiB · 5,000 rows · no partial imports</span></div>
            </div>
            <form className="upload-card" onSubmit={app.importCsv}>
              <label htmlFor="csv-file">CSV file</label>
              <input id="csv-file" type="file" accept="text/csv,.csv" onChange={event => { app.setCsvFile(event.target.files?.[0] ?? null); app.setCsvDiagnostics([]); }} required />
              <button type="submit" disabled={!app.csvFile}>Import CSV</button>
            </form>
            {app.csvDiagnostics.length > 0 && (
              <div className="diagnostics-panel">
                <h3>CSV diagnostics</h3>
                <ul aria-label="CSV diagnostics">
                  {app.csvDiagnostics.map((item, index) => <li key={`${item.row}-${item.code}-${index}`}>Row {item.row || 'file'} · {item.field} · {item.code}: {item.message}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function HistoryRow({ app, item }: { app: BudgetAppController; item: HistoryItem }) {
  const isTransfer = item.kind === 'TRANSFER';
  return (
    <li data-testid={`transaction-${item.transactionId}`}>
      <div className="history-row-main">
        <div>
          <span className={`transaction-kind kind-${item.kind.toLowerCase()}`}>{item.kind === 'INCOME' ? 'Income' : isTransfer ? 'Transfer' : 'Spending'}</span>
          <strong>{item.amountMinor} minor units</strong>
          <span>{item.date}{isTransfer ? ` · ${item.sourceAccount.name} → ${item.destinationAccount.name}` : item.category ? ` · ${item.category.name}${item.category.archived ? ' (archived)' : ''}` : ''}</span>
          <small>{item.payee ? `Payee: ${item.payee}` : 'No payee'}{item.memo ? ` · Memo: ${item.memo}` : ''}</small>
        </div>
        {isTransfer ? <span className="read-only-badge">Read only</span> : item.state === 'PROTECTED' ? <span className="read-only-badge">Protected · released income</span> : (
          <div className="row-actions">
            <button type="button" onClick={() => app.beginHistoryEdit(item)}>Edit</button>
            <button type="button" className="secondary" onClick={() => { app.setDeletingId(item.transactionId); app.setEditingId(null); app.setDeleteReason(''); }}>Delete</button>
          </div>
        )}
      </div>

      {!isTransfer && item.state !== 'PROTECTED' && app.editingId === item.transactionId && (
        <form className="history-editor" onSubmit={event => app.saveHistoryEdit(event, item)}>
          <label htmlFor={`history-amount-${item.transactionId}`}>Amount (minor units)</label>
          <input id={`history-amount-${item.transactionId}`} type="number" min="1" value={app.editAmount} onChange={event => app.setEditAmount(event.target.value)} required />
          <label htmlFor={`history-date-${item.transactionId}`}>Date</label>
          <input id={`history-date-${item.transactionId}`} type="date" value={app.editDate} onChange={event => app.setEditDate(event.target.value)} required />
          <label htmlFor={`history-payee-${item.transactionId}`}>Payee</label>
          <input id={`history-payee-${item.transactionId}`} value={app.editPayee} onChange={event => app.setEditPayee(event.target.value)} />
          <label htmlFor={`history-memo-${item.transactionId}`}>Memo</label>
          <textarea id={`history-memo-${item.transactionId}`} value={app.editMemo} onChange={event => app.setEditMemo(event.target.value)} />
          {item.kind === 'SPENDING' && <><label htmlFor={`history-category-${item.transactionId}`}>Category</label><select id={`history-category-${item.transactionId}`} aria-label="Category" value={app.editCategory} onChange={event => app.setEditCategory(event.target.value)}><option value="">Keep current category</option>{app.activeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></>}
          <div className="actions"><button type="submit">Save history edit</button><button type="button" className="secondary" onClick={() => app.setEditingId(null)}>Cancel</button></div>
        </form>
      )}

      {!isTransfer && item.state !== 'PROTECTED' && app.deletingId === item.transactionId && (
        <form className="history-editor" onSubmit={event => app.confirmHistoryDelete(event, item)}>
          <label htmlFor={`delete-reason-${item.transactionId}`}>Delete reason (optional)</label>
          <textarea id={`delete-reason-${item.transactionId}`} value={app.deleteReason} onChange={event => app.setDeleteReason(event.target.value)} />
          <div className="actions"><button type="submit">Confirm delete</button><button type="button" className="secondary" onClick={() => app.setDeletingId(null)}>Cancel</button></div>
        </form>
      )}
    </li>
  );
}
