'use client';

import { useState, type FormEvent } from 'react';

type Setup = { id: string; setupStep: string; account: { openingBalanceMinor: number } | null; categories: { id: string; name: string; archived: boolean }[] };

export default function Home() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null); const [opening, setOpening] = useState(''); const [categories, setCategories] = useState('Bills, Food'); const [message, setMessage] = useState('');
  const call = async (url: string, options?: RequestInit) => { const response = await fetch(url, { credentials: 'include', ...options }); const result = await response.json(); if (!response.ok) throw Error(result.error?.message || 'Request failed'); return result.data; };
  const auth = async (event: FormEvent, action: 'register' | 'sign-in') => { event.preventDefault(); try { await call(`/api/v1/auth/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); setMessage(action === 'register' ? 'Account created. Sign in to continue.' : 'Signed in. Start or resume your budget setup.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Authentication failed'); } };
  const signIn = (event: FormEvent) => auth(event, 'sign-in');
  const register = (event: FormEvent) => auth(event, 'register');
  const start = async () => { try { setSetup(await call('/api/v1/budgets')); } catch { try { setSetup(await call('/api/v1/budgets', { method: 'POST' })); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load setup'); } } };
  const save = async (event: FormEvent) => { event.preventDefault(); if (!setup) return; try { setSetup(await call(`/api/v1/budgets/${setup.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ openingBalanceMinor: opening === '' ? undefined : Number(opening), accountType: 'checking', categories: categories.split(',') }) })); setMessage('Setup saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save setup'); } };
  const signOut = async () => { await call('/api/v1/auth/sign-out', { method: 'POST' }); setMessage('Signed out.'); };
  return <main><h1>Personal budget</h1><form onSubmit={signIn}><label>Email <input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password <input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button>Sign in</button></form><form onSubmit={register}><button type="submit">Create account</button></form><button onClick={start}>Start or resume setup</button>{message && <p role="status">{message}</p>}{setup && <section><h2>Setup: {setup.setupStep}</h2><form onSubmit={save}><label>Opening balance (minor units) <input inputMode="numeric" value={opening} onChange={e => setOpening(e.target.value)} /></label><label>Categories <input value={categories} onChange={e => setCategories(e.target.value)} /></label><button>Save and resume later</button></form><p>{setup.categories.filter(category => !category.archived).length} active categories</p><p>Income, spending, assignments, reports, and other advanced features are unavailable in this slice.</p></section>}<button onClick={signOut}>Sign out</button></main>;
}
