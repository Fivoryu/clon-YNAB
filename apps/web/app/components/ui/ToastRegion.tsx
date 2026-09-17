'use client';

import { useEffect } from 'react';
import { useBudget } from '../../providers/BudgetAppProvider';

export function ToastRegion() {
  const { notice, setNotice } = useBudget();
  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);
  if (!notice) return null;
  return <div className={`toast toast-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" aria-label="Cerrar mensaje" onClick={() => setNotice(null)}>×</button></div>;
}
