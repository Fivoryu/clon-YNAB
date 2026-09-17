import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { BudgetAppProvider } from './providers/BudgetAppProvider';

export const metadata: Metadata = {
  title: 'Mi Presupuesto',
  description: 'Planifica, registra y entiende tu dinero con claridad.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="es"><body><BudgetAppProvider>{children}</BudgetAppProvider></body></html>;
}
