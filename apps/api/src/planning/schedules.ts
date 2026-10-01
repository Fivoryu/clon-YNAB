export type ScheduleFlow = 'INCOME' | 'SPENDING';

export type ScheduleDefinition = {
  accountId: string;
  categoryId: string | null;
  flow: ScheduleFlow;
  amountMinor: number;
  payee?: string | null;
  memo?: string | null;
  dayOfMonth: number;
  intervalMonths: number;
  startDate: string;
};

type CalendarDate = { year: number; month: number; day: number };
type OccurrenceSchedule = Pick<ScheduleDefinition, 'startDate' | 'dayOfMonth' | 'intervalMonths'>;

const daysInMonth = (year: number, month: number) => {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
};

const parseCalendarDate = (value: unknown): CalendarDate | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
};

const compareDates = (left: CalendarDate, right: CalendarDate) =>
  left.year - right.year || left.month - right.month || left.day - right.day;

const formatDate = ({ year, month, day }: CalendarDate) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function scheduleOccurrences(schedule: OccurrenceSchedule, cutoffDate: string): string[] {
  const start = parseCalendarDate(schedule.startDate);
  const cutoff = parseCalendarDate(cutoffDate);
  if (!start) throw new RangeError('Schedule startDate must be a valid YYYY-MM-DD calendar date');
  if (!cutoff) throw new RangeError('cutoffDate must be a valid YYYY-MM-DD calendar date');
  if (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31) {
    throw new RangeError('dayOfMonth must be an integer from 1 through 31');
  }
  if (!Number.isInteger(schedule.intervalMonths) || schedule.intervalMonths < 1 || schedule.intervalMonths > 12) {
    throw new RangeError('intervalMonths must be an integer from 1 through 12');
  }
  if (compareDates(start, cutoff) > 0) return [];

  const occurrences: string[] = [];
  let year = start.year;
  let month = start.month;
  while (true) {
    const candidate = {
      year,
      month,
      day: Math.min(schedule.dayOfMonth, daysInMonth(year, month)),
    };
    if (compareDates(candidate, cutoff) > 0) break;
    occurrences.push(formatDate(candidate));

    const nextMonth = month - 1 + schedule.intervalMonths;
    year += Math.floor(nextMonth / 12);
    month = nextMonth % 12 + 1;
  }
  return occurrences;
}

export function occurrenceIdentity(scheduleId: string, occurrenceDate: string): string {
  return `sch:${scheduleId}:${occurrenceDate}`;
}

export function generatedCleared(accountKind: string | undefined): boolean {
  return accountKind === 'CASH';
}

export function validateScheduleDefinition(input: unknown): input is ScheduleDefinition {
  if (typeof input !== 'object' || input === null) return false;
  const definition = input as Record<string, unknown>;
  if (typeof definition.accountId !== 'string' || definition.accountId.length === 0) return false;
  if (definition.flow !== 'INCOME' && definition.flow !== 'SPENDING') return false;
  if (typeof definition.amountMinor !== 'number' || !Number.isSafeInteger(definition.amountMinor) || definition.amountMinor <= 0) return false;
  if (definition.payee !== undefined && definition.payee !== null && typeof definition.payee !== 'string') return false;
  if (definition.memo !== undefined && definition.memo !== null && typeof definition.memo !== 'string') return false;
  if (!Number.isInteger(definition.dayOfMonth) || Number(definition.dayOfMonth) < 1 || Number(definition.dayOfMonth) > 31) return false;
  if (!Number.isInteger(definition.intervalMonths) || Number(definition.intervalMonths) < 1 || Number(definition.intervalMonths) > 12) return false;
  const startDate = parseCalendarDate(definition.startDate);
  if (!startDate || startDate.day !== Math.min(Number(definition.dayOfMonth), daysInMonth(startDate.year, startDate.month))) return false;
  const hasCategory = typeof definition.categoryId === 'string' && definition.categoryId.length > 0;
  if (definition.categoryId !== null && !hasCategory) return false;
  if (definition.flow === 'INCOME' && hasCategory) return false;
  if (definition.flow === 'SPENDING' && !hasCategory) return false;
  return true;
}
