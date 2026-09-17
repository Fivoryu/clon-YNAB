'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RouteGate } from '../components/shell/RouteGate';
import { ToastRegion } from '../components/ui/ToastRegion';
import { useBudget } from '../providers/BudgetAppProvider';

export default function RegisterPage() {
  const router = useRouter(); const app = useBudget(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); if (password !== confirm) { app.setNotice({ kind: 'error', text: 'Las contraseñas no coinciden.' }); return; } const budget = await app.authenticate(email, password, 'register'); if (budget) router.push('/setup'); };
  return <RouteGate gate="guest"><main className="auth-shell"><section className="auth-intro"><p className="eyebrow">Empieza simple</p><h1>Primero entiende tu dinero. Luego decide qué hará.</h1><p className="lead">Crear tu cuenta te llevará directamente a preparar tu primera cuenta y tus categorías.</p></section><section className="card auth-card"><p className="section-kicker">Nueva cuenta</p><h2>Crea tu acceso</h2><form onSubmit={submit}><label htmlFor="register-email">Correo</label><input id="register-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /><label htmlFor="register-password">Contraseña</label><input id="register-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /><label htmlFor="register-confirm">Repite la contraseña</label><input id="register-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required /><button type="submit" disabled={app.busy}>{app.busy ? 'Creando…' : 'Crear cuenta y continuar'}</button></form><p className="auth-switch">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p></section><ToastRegion /></main></RouteGate>;
}
