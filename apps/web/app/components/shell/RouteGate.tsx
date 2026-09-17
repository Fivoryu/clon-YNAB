'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useBudget } from '../../providers/BudgetAppProvider';

type Gate = 'guest' | 'setup' | 'ready';

export function RouteGate({ gate, children }: { gate: Gate; children: ReactNode }) {
  const { status } = useBudget();
  const router = useRouter();

  useEffect(() => {
    if (status === 'checking') return;
    if (gate === 'guest') {
      if (status === 'setup') router.replace('/setup');
      if (status === 'ready') router.replace('/budget');
      return;
    }
    if (status === 'guest') router.replace('/login');
    else if (gate === 'setup' && status === 'ready') router.replace('/budget');
    else if (gate === 'ready' && status === 'setup') router.replace('/setup');
  }, [gate, router, status]);

  const allowed = gate === 'guest' ? status === 'guest' : gate === 'setup' ? status === 'setup' : status === 'ready';
  if (!allowed) return <main className="loading-screen"><div className="spinner" /><p>Preparando tu presupuesto…</p></main>;
  return <>{children}</>;
}
