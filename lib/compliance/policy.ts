import type { Classification } from '@/db/schema/enums';

export type CompliancePolicy = {
  reassessmentMonths?: Partial<Record<Classification, number>>;
  dueSoonDays?: number;
};

const DEFAULT_REASSESSMENT_MONTHS: Record<Classification, number> = {
  OFFICIAL: 36,
  OFFICIAL_SENSITIVE: 36,
  PROTECTED: 24,
  SECRET: 24,
  TOP_SECRET: 12,
};

export function reassessmentMonthsFor(
  classification: Classification,
  policy?: CompliancePolicy | null,
): number {
  return policy?.reassessmentMonths?.[classification] ?? DEFAULT_REASSESSMENT_MONTHS[classification];
}

export function dueSoonDays(policy?: CompliancePolicy | null): number {
  return policy?.dueSoonDays ?? 60;
}

export function addCalendarMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() < day) next.setDate(0);
  return next;
}

export function daysUntil(date: Date, from = new Date()): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}
