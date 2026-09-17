'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { RouteGate } from '../components/shell/RouteGate';
import { ToastRegion } from '../components/ui/ToastRegion';
import { useBudget } from '../providers/BudgetAppProvider';

export default function LoginPage() {
  const router = useRouter(); const app = useBudget(); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); const budget = await app.authenticate(email, password, 'login'); if (budget) router.push(budget.setupStep === 'COMPLETE' ? '/budget' : '/setup'); };
  return <RouteGate gate="guest"><main className="auth-shell"><section className="auth-intro"><p className="eyebrow">Presupuesto personal</p><h1>Haz que tu dinero tenga una intención.</h1><p className="lead">Organiza lo que tienes, registra lo que ocurre y ajusta tus prioridades sin perder de vista el panorama.</p><div className="feature-strip"><span>Plan por categorías</span><span>Varias cuentas</span><span>Historial claro</span></div></section><section className="card auth-card"><p className="section-kicker">Bienvenido</p><h2>Inicia sesión</h2><p className="muted">Tu presupuesto se abrirá automáticamente.</p><form onSubmit={submit}><label htmlFor="email">Correo</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /><label htmlFor="password">Contraseña</label><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required /><button type="submit" disabled={app.busy}>{app.busy ? 'Entrando…' : 'Entrar'}</button></form><p className="auth-switch">¿Primera vez? <Link href="/register">Crear una cuenta</Link></p></section><ToastRegion /></main></RouteGate>;
}
