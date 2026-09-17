'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useBudgetApp, type BudgetAppController } from '../hooks/useBudgetApp';

const BudgetAppContext = createContext<BudgetAppController | null>(null);

export function BudgetAppProvider({ children }: { children: ReactNode }) {
  const controller = useBudgetApp();
  return <BudgetAppContext.Provider value={controller}>{children}</BudgetAppContext.Provider>;
}

export function useBudget() {
  const value = useContext(BudgetAppContext);
  if (!value) throw new Error('useBudget must be used inside BudgetAppProvider');
  return value;
}
