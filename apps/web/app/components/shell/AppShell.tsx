'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useBudget } from '../../providers/BudgetAppProvider';
import { ToastRegion } from '../ui/ToastRegion';

const nav = [
  { href: '/budget', label: 'Presupuesto', icon: '◎' },
  { href: '/transactions', label: 'Transacciones', icon: '↕' },
  { href: '/accounts', label: 'Cuentas', icon: '▣' },
  { href: '/settings/data', label: 'Configuración', icon: '⚙' },
];

export function AppShell({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, busy } = useBudget();
  const logout = async () => { await signOut(); router.replace('/login'); };
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/budget" className="brand"><span className="brand-mark">Y</span><span><strong>Mi Presupuesto</strong><small>Planifica con intención</small></span></Link>
        <nav aria-label="Navegación principal">
          {nav.map(item => <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'nav-link active' : 'nav-link'}><span>{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className="sidebar-foot"><button type="button" className="ghost danger" onClick={logout} disabled={busy}>Cerrar sesión</button></div>
      </aside>
      <div className="app-main">
        <header className="page-header"><div><p className="eyebrow">Mi presupuesto</p><h1>{title}</h1>{subtitle && <p className="lead">{subtitle}</p>}</div>{action && <div className="header-action">{action}</div>}</header>
        <main className="page-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">{nav.slice(0, 3).map(item => <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'active' : ''}><span>{item.icon}</span><small>{item.label}</small></Link>)}<Link href="/settings/data" className={pathname.startsWith('/settings') ? 'active' : ''}><span>⚙</span><small>Más</small></Link></nav>
      <ToastRegion />
    </div>
  );
}
