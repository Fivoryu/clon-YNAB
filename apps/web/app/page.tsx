'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBudget } from './providers/BudgetAppProvider';

export default function Home() {
  const { status } = useBudget();
  const router = useRouter();
  useEffect(() => {
    if (status === 'guest') router.replace('/login');
    if (status === 'setup') router.replace('/setup');
    if (status === 'ready') router.replace('/budget');
  }, [router, status]);
  return <main className="loading-screen"><div className="spinner" /><p>Abriendo tu presupuesto…</p></main>;
}
