'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  DEFAULT_TIME_ZONE,
  formatDate,
  formatDateInput,
  formatDateTime,
  formatDateTimeInput,
  formatTimeZoneOffset,
  normaliseTimeZone,
  zonedDateEndToUtc,
  zonedDateTimeToUtc,
} from '@/lib/timezone';

const TimeZoneContext = createContext(DEFAULT_TIME_ZONE);

export function UserTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: string;
  children: ReactNode;
}) {
  return (
    <TimeZoneContext.Provider value={normaliseTimeZone(timeZone)}>
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useUserTimeZone() {
  const timeZone = useContext(TimeZoneContext);
  return {
    timeZone,
    formatDate: (value: Date | string | number) => formatDate(value, timeZone),
    formatDateTime: (value: Date | string | number) => formatDateTime(value, timeZone),
    formatDateInput: (value: Date | string | number) => formatDateInput(value, timeZone),
    formatDateTimeInput: (value: Date | string | number) => formatDateTimeInput(value, timeZone),
    toUtc: (value: string) => zonedDateTimeToUtc(value, timeZone),
    dateEndToUtc: (value: string) => zonedDateEndToUtc(value, timeZone),
  };
}

export function UserDateTime({ value }: { value: Date | string | number }) {
  const { timeZone, formatDateTime: format } = useUserTimeZone();
  const date = value instanceof Date ? value : new Date(value);
  return (
    <time dateTime={date.toISOString()} title={`${timeZone} (${formatTimeZoneOffset(timeZone, date)})`}>
      {format(value)}
    </time>
  );
}

export function UserDate({ value }: { value: Date | string | number }) {
  const { timeZone, formatDate: format } = useUserTimeZone();
  const date = value instanceof Date ? value : new Date(value);
  return (
    <time dateTime={date.toISOString()} title={timeZone}>
      {format(value)}
    </time>
  );
}
