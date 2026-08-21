export const DEFAULT_TIME_ZONE = 'Australia/Sydney';

type DateValue = Date | string | number;

const datePartsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function normaliseTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

export function supportedTimeZones(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
  ).supportedValuesOf;
  return supportedValuesOf?.('timeZone') ?? [DEFAULT_TIME_ZONE, 'UTC'];
}

export function formatDateTime(value: DateValue, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: normaliseTimeZone(timeZone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(toDate(value));
}

export function formatDate(value: DateValue, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: normaliseTimeZone(timeZone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(value));
}

export function formatTimeZoneOffset(timeZone: string, value: DateValue = new Date()): string {
  const zone = normaliseTimeZone(timeZone);
  const offset = new Intl.DateTimeFormat('en-AU', {
    timeZone: zone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(toDate(value))
    .find((part) => part.type === 'timeZoneName')?.value;
  return (offset ?? 'GMT').replace('GMT', 'UTC');
}

export function formatDateInput(value: DateValue, timeZone: string): string {
  const parts = zonedParts(toDate(value), normaliseTimeZone(timeZone));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTimeInput(value: DateValue, timeZone: string): string {
  const parts = zonedParts(toDate(value), normaliseTimeZone(timeZone));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function zonedDateTimeToUtc(localValue: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
    localValue,
  );
  if (!match) throw new Error('Enter a valid local date and time');

  const [, year, month, day, hour, minute, second = '00', millisecond = '0'] = match;
  const expected = {
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
  const zone = normaliseTimeZone(timeZone);
  const wallClockUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, '0')),
  );

  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    candidate = wallClockUtc - offsetMilliseconds(new Date(candidate), zone);
  }

  const result = new Date(candidate);
  const actual = zonedParts(result, zone);
  if (Object.entries(expected).some(([key, value]) => actual[key as keyof typeof actual] !== value)) {
    throw new Error(`That local time does not exist in ${zone} because of daylight saving time`);
  }
  return result;
}

export function zonedDateEndToUtc(localDate: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('Enter a valid date');
  return zonedDateTimeToUtc(`${localDate}T23:59:59.999`, timeZone);
}

function toDate(value: DateValue): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date;
}

function zonedParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    datePartsFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function offsetMilliseconds(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}
