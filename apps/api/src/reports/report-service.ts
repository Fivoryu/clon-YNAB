import { calculateAccountBalance, calculateCategory, calculateRta, positiveRollover } from '../planning/engine.ts';
import type { FinancialEvent, FinancialState } from '../persistence/financial-store.ts';
import { foldEffectiveHistory } from '../planning/transaction-history.ts';

export type FinancialSummary = {
  month: string;
  accountBalanceMinor: number;
  rta: ReturnType<typeof calculateRta>;
  categories: (FinancialState['categories'][number] & ReturnType<typeof calculateCategory>)[];
  version: number;
};

export class ReportService {
  read(state: FinancialState, requestedMonth: string, events: FinancialEvent[] = state.events): FinancialSummary {
    if (events === state.events && state.rawEvents) events = foldEffectiveHistory(state.rawEvents);
    const income = events.filter(e => e.kind === 'INCOME' && e.month === requestedMonth).reduce((sum, e) => sum + e.amountMinor, 0);
    const released = events.filter(e => e.kind === 'INCOME_RELEASE' && e.month === requestedMonth).reduce((sum, e) => sum + e.amountMinor, 0);
    const accountIncome = events.filter(e => e.kind === 'INCOME').reduce((sum, e) => sum + e.amountMinor, 0);
    const spending = events.filter(e => e.kind === 'SPENDING').reduce((sum, e) => sum + e.amountMinor, 0);
    const prior = this.categoryCarry(state, requestedMonth, events);
    const assigned = events.filter(e => e.month === requestedMonth && (e.kind === 'ASSIGNMENT' || e.kind === 'UNASSIGNMENT')).reduce((sum, e) => sum + (e.kind === 'ASSIGNMENT' ? e.amountMinor : -e.amountMinor), 0);
    const categories = state.categories.map(category => ({ ...category, ...this.categoryValues(state, category.id, requestedMonth, events) }));
    return {
      month: requestedMonth,
      accountBalanceMinor: calculateAccountBalance({ openingBalanceMinor: state.account?.openingBalanceMinor ?? 0, incomeMinor: accountIncome, spendingMinor: spending }),
      rta: calculateRta({ openingBalanceMinor: state.account?.openingBalanceMinor ?? 0, releasedIncomeMinor: released, unreleasedIncomeMinor: income - released, priorCarryMinor: prior, assignedMinor: assigned }),
      categories,
      version: state.version,
    };
  }

  private categoryCarry(state: FinancialState, requestedMonth: string, events: FinancialEvent[]) {
    const previous = previousMonth(requestedMonth);
    return state.categories.reduce((sum, category) => sum + positiveRollover(this.categoryValues(state, category.id, previous, events).availableMinor), 0);
  }

  private categoryValues(state: FinancialState, categoryId: string, requestedMonth: string, events: FinancialEvent[]) {
    const carry = this.categoryCarryFor(state, categoryId, requestedMonth, events);
    const assigned = events.filter(e => e.month === requestedMonth).reduce((sum, e) => sum + (e.kind === 'ASSIGNMENT' && e.categoryId === categoryId ? e.amountMinor : e.kind === 'UNASSIGNMENT' && e.categoryId === categoryId ? -e.amountMinor : e.kind === 'MOVE' && e.destinationCategoryId === categoryId ? e.amountMinor : e.kind === 'MOVE' && e.sourceCategoryId === categoryId ? -e.amountMinor : 0), 0);
    const activity = -events.filter(e => e.kind === 'SPENDING' && e.month === requestedMonth && e.categoryId === categoryId).reduce((sum, e) => sum + e.amountMinor, 0);
    return calculateCategory({ carryoverMinor: carry, assignedMinor: Math.max(0, assigned), activityMinor: activity });
  }

  private categoryCarryFor(state: FinancialState, categoryId: string, requestedMonth: string, events: FinancialEvent[]) {
    const previous = previousMonth(requestedMonth);
    if (!events.some(e => e.month && e.month <= previous && (e.categoryId === categoryId || e.sourceCategoryId === categoryId || e.destinationCategoryId === categoryId))) return 0;
    return positiveRollover(this.categoryValues(state, categoryId, previous, events).availableMinor);
  }
}

const previousMonth = (value: string) => {
  const date = new Date(`${value}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
};
