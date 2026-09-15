'use client';

import type { FormEvent } from 'react';

type Props = {
  email: string;
  password: string;
  message: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onAuthenticate: (event: FormEvent, action: 'register' | 'sign-in') => Promise<void>;
  onContinue: () => Promise<void>;
};

export function AuthScreen({
  email,
  password,
  message,
  onEmailChange,
  onPasswordChange,
  onAuthenticate,
  onContinue,
}: Props) {
  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="welcome-heading">
        <p className="eyebrow">Personal budgeting</p>
        <h1 id="welcome-heading">Give every amount a clear purpose.</h1>
        <p className="lead">
          Sign in to continue your budget, or create an account if this is your first time here.
          Your setup and financial history stay on the server.
        </p>
        <div className="feature-strip" aria-label="What you can do">
          <span>Plan by category</span>
          <span>Track accounts</span>
          <span>Review history</span>
        </div>
      </section>

      <section className="card auth-card" aria-labelledby="account-heading">
        <p className="section-kicker">Welcome back</p>
        <h2 id="account-heading">Access your budget</h2>
        <p className="muted">Use your email and password. If this browser already has a session, continue directly.</p>
        <form onSubmit={event => onAuthenticate(event, 'sign-in')}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={event => onEmailChange(event.target.value)} autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={event => onPasswordChange(event.target.value)} autoComplete="current-password" required />
          <button type="submit">Sign in</button>
          <button type="button" className="secondary" onClick={event => onAuthenticate(event as unknown as FormEvent, 'register')}>Create account</button>
        </form>

        <div className="session-shortcut">
          <p><strong>Already signed in on this browser?</strong></p>
          <p className="muted">Skip the form and reopen your existing budget.</p>
          <button type="button" className="link-button" onClick={onContinue}>Start or resume setup</button>
        </div>

        {message && <p className="status" role="status" aria-live="polite">{message}</p>}
      </section>
    </main>
  );
}
