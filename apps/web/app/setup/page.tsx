'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { RouteGate } from '../components/shell/RouteGate';
import { ToastRegion } from '../components/ui/ToastRegion';
import { MoneyInput } from '../components/ui/MoneyInput';
import { minorToInput, parseOptionalMoneyToMinor } from '../lib/money';
import { useBudget } from '../providers/BudgetAppProvider';

type Stage = 'account' | 'categories' | 'review';

export default function SetupPage() {
  const app = useBudget(); const router = useRouter();
  const [stage, setStage] = useState<Stage>('account'); const [accountName, setAccountName] = useState('Cuenta principal'); const [accountType, setAccountType] = useState<'cash' | 'checking'>('checking'); const [opening, setOpening] = useState('0.00');
  const [categories, setCategories] = useState<string[]>(['Vivienda', 'Comida', 'Transporte']); const [draftCategory, setDraftCategory] = useState('');
  useEffect(() => {
    if (app.budget?.account) {
      setAccountName(app.budget.account.name);
      setAccountType(app.budget.account.kind === 'CASH' ? 'cash' : 'checking');
      setOpening(minorToInput(app.budget.account.openingBalanceMinor));
    }
    const existing = app.budget?.categories.filter(category => !category.archived).map(category => category.name) ?? [];
    if (existing.length) setCategories(existing);
    if (app.budget?.setupStep === 'CATEGORIES') setStage('categories');
  }, [app.budget]);
  const saveAccount = async (event: FormEvent) => { event.preventDefault(); try { const minor = parseOptionalMoneyToMinor(opening) ?? 0; const result = await app.saveSetupAccount({ accountName, accountType, openingBalanceMinor: minor }); if (result) setStage('categories'); } catch (error) { app.setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Monto inválido.' }); } };
  const addCategory = () => { const value = draftCategory.trim(); if (!value || categories.some(c => c.toLowerCase() === value.toLowerCase())) return; setCategories(current => [...current, value]); setDraftCategory(''); };
  const finish = async () => { const result = await app.saveSetupCategories(categories); if (result?.setupStep === 'COMPLETE') router.push('/budget'); };
  return <RouteGate gate="setup"><main className="setup-shell"><header className="setup-header"><div><p className="eyebrow">Preparar presupuesto</p><h1>Construyamos una base clara.</h1><p className="lead">Solo te pediremos lo necesario para empezar. Podrás cambiar cuentas y categorías después.</p></div><div className="setup-progress" aria-label="Progreso"><span className={stage === 'account' ? 'active' : 'done'}>Cuenta</span><i /><span className={stage === 'categories' ? 'active' : stage === 'review' ? 'done' : ''}>Categorías</span><i /><span className={stage === 'review' ? 'active' : ''}>Listo</span></div></header>{stage === 'account' && <section className="card setup-card"><p className="section-kicker">Dónde está tu dinero</p><h2>Tu cuenta principal</h2><p className="muted">Empieza con la cuenta que más usas. El saldo es lo que tienes disponible hoy.</p><form onSubmit={saveAccount}><label htmlFor="account-name">Nombre</label><input id="account-name" value={accountName} onChange={e => setAccountName(e.target.value)} required /><label htmlFor="account-type">Tipo</label><select id="account-type" value={accountType} onChange={e => setAccountType(e.target.value as 'cash' | 'checking')}><option value="checking">Cuenta bancaria</option><option value="cash">Efectivo</option></select><MoneyInput id="opening-balance" label="Saldo actual" value={opening} onChange={setOpening} /><button type="submit" disabled={app.busy}>Guardar y continuar</button></form></section>}{stage === 'categories' && <section className="card setup-card"><p className="section-kicker">Para qué es tu dinero</p><h2>Elige tus primeras categorías</h2><p className="muted">Piensa en tus gastos y prioridades habituales. No necesitas tener la lista perfecta ahora.</p><div className="chip-editor"><div className="chip-list">{categories.map(category => <button type="button" key={category} className="chip" onClick={() => setCategories(current => current.filter(c => c !== category))}>{category}<span>×</span></button>)}</div><div className="chip-add"><input aria-label="Nueva categoría" value={draftCategory} onChange={e => setDraftCategory(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }} placeholder="Ej. Salud" /><button type="button" className="secondary" onClick={addCategory}>Agregar</button></div></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setStage('account')}>Volver</button><button type="button" onClick={() => categories.length && setStage('review')} disabled={!categories.length}>Revisar</button></div></section>}{stage === 'review' && <section className="card setup-card"><p className="section-kicker">Todo listo</p><h2>Tu presupuesto empieza con esto</h2><div className="review-grid"><div><span>Cuenta principal</span><strong>{accountName}</strong><small>{accountType === 'checking' ? 'Cuenta bancaria' : 'Efectivo'}</small></div><div><span>Categorías</span><strong>{categories.length}</strong><small>{categories.join(' · ')}</small></div></div><p className="muted">Al continuar verás cuánto dinero está listo para asignar a estas prioridades.</p><div className="form-actions"><button type="button" className="secondary" onClick={() => setStage('categories')}>Editar categorías</button><button type="button" onClick={finish} disabled={app.busy}>{app.busy ? 'Preparando…' : 'Abrir mi presupuesto'}</button></div></section>}<ToastRegion /></main></RouteGate>;
}
