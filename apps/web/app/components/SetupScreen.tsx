'use client';

import type { FormEvent } from 'react';
import type { Budget } from '../models';

type Props = {
  budget: Budget;
  accountName: string;
  opening: string;
  categoryNames: string;
  message: string;
  onAccountNameChange: (value: string) => void;
  onOpeningChange: (value: string) => void;
  onCategoryNamesChange: (value: string) => void;
  onSave: (event: FormEvent) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function SetupScreen({
  budget,
  accountName,
  opening,
  categoryNames,
  message,
  onAccountNameChange,
  onOpeningChange,
  onCategoryNamesChange,
  onSave,
  onSignOut,
}: Props) {
  const accountReady = Boolean(budget.account);
  const categoriesReady = budget.categories.some(category => !category.archived);

  return (
    <main className="setup-shell">
      <header className="setup-header">
        <div>
          <p className="eyebrow">Budget setup</p>
          <h1>Prepare your workspace.</h1>
          <p className="lead">Start with where your money is, then give it useful categories. Your full workspace unlocks when both are ready.</p>
        </div>
        <button type="button" className="secondary compact" onClick={onSignOut}>Sign out</button>
      </header>

      {message && <p className="status" role="status" aria-live="polite">{message}</p>}

      <section className="setup-path" aria-label="Budget setup progress">
        <div className={`setup-path-item ${budget.setupStep === 'ACCOUNT' ? 'current' : ''} ${accountReady ? 'done' : ''}`}>
          <span className="status-dot" aria-hidden="true" />
          <div><strong>Your first account</strong><span>{accountReady ? 'Ready' : 'Start here'}</span></div>
        </div>
        <div className={`setup-path-item ${budget.setupStep === 'CATEGORIES' ? 'current' : ''} ${categoriesReady ? 'done' : ''}`}>
          <span className="status-dot" aria-hidden="true" />
          <div><strong>Your categories</strong><span>{categoriesReady ? 'Ready' : accountReady ? 'Continue here' : 'Available next'}</span></div>
        </div>
        <div className="setup-path-item">
          <span className="status-dot" aria-hidden="true" />
          <div><strong>Budget workspace</strong><span>Unlocks when setup is complete</span></div>
        </div>
      </section>

      <form className="setup-form" onSubmit={onSave}>
        <section className={`card setup-block ${budget.setupStep === 'ACCOUNT' ? 'recommended' : ''}`}>
          <p className="section-kicker">Money location</p>
          <h2>Account details</h2>
          <p className="muted">Use the account you normally spend from and enter its current balance in minor units.</p>
          <label htmlFor="account-name">Account name</label>
          <input id="account-name" value={accountName} onChange={event => onAccountNameChange(event.target.value)} placeholder="Checking" />
          <label htmlFor="opening-balance">Opening balance (minor units)</label>
          <input id="opening-balance" inputMode="numeric" type="number" value={opening} onChange={event => onOpeningChange(event.target.value)} placeholder="50000" />
        </section>

        <section className={`card setup-block ${budget.setupStep === 'CATEGORIES' ? 'recommended' : ''}`}>
          <p className="section-kicker">Planning structure</p>
          <h2>Categories</h2>
          <p className="muted">Add the areas you want to plan for. Separate category names with commas.</p>
          <label htmlFor="categories">Categories (comma separated)</label>
          <input id="categories" value={categoryNames} onChange={event => onCategoryNamesChange(event.target.value)} placeholder="Bills, Food, Transport" />
        </section>

        <div className="setup-finish">
          <div><strong>Ready to start planning?</strong><p className="muted">You can add more accounts and manage transactions after setup.</p></div>
          <button type="submit">Save and complete setup</button>
        </div>
      </form>
    </main>
  );
}
