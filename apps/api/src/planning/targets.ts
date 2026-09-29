export type TargetKind = 'MONTHLY_SET_ASIDE' | 'BALANCE_BY_DATE';
export type TargetDefinition = { kind: TargetKind; amountMinor: number; targetMonth?: string };
export type TargetValues = { assignedMinor: number; availableMinor: number };
export type TargetStatus = 'MET' | 'UNDERFUNDED' | 'OVERDUE';
export type ProjectedTargetState = {
  kind: TargetKind;
  amountMinor: number;
  targetMonth?: string;
  progressMinor: number;
  remainingMinor: number;
  status: TargetStatus;
};

export const projectTargetState = (
  target: TargetDefinition,
  values: TargetValues,
  requestedMonth: string,
): ProjectedTargetState => {
  const progressMinor = target.kind === 'MONTHLY_SET_ASIDE' ? values.assignedMinor : values.availableMinor;
  const remainingMinor = Math.max(0, target.amountMinor - progressMinor);
  const status: TargetStatus = progressMinor >= target.amountMinor
    ? 'MET'
    : target.kind === 'BALANCE_BY_DATE' && target.targetMonth !== undefined && target.targetMonth < requestedMonth
      ? 'OVERDUE'
      : 'UNDERFUNDED';

  return {
    kind: target.kind,
    amountMinor: target.amountMinor,
    ...(target.kind === 'BALANCE_BY_DATE' && target.targetMonth !== undefined ? { targetMonth: target.targetMonth } : {}),
    progressMinor,
    remainingMinor,
    status,
  };
};
