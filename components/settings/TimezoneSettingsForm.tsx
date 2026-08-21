'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserTimeZone } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatDateTime, formatTimeZoneOffset } from '@/lib/timezone';

export function TimezoneSettingsForm({
  initialTimeZone,
  timeZones,
}: {
  initialTimeZone: string;
  timeZones: string[];
}) {
  const router = useRouter();
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const now = new Date();

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateUserTimeZone({ timeZone });
        setMessage('Timezone saved. Dates and times now use this timezone.');
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not save timezone');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="timeZone">Timezone</Label>
        <select
          id="timeZone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          className="flex h-10 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-950">Current local time</p>
        <p className="mt-1">{formatDateTime(now, timeZone)}</p>
        <p className="mt-1 text-xs">
          IANA identifier: <span className="font-mono">{timeZone}</span> · Current offset:{' '}
          {formatTimeZoneOffset(timeZone, now)}
        </p>
        <p className="mt-2 text-xs">
          Timestamps are stored as UTC instants, then displayed and entered using this timezone.
          Daylight-saving changes are applied automatically.
        </p>
      </div>

      {message && <p aria-live="polite" className="text-sm text-slate-700">{message}</p>}
      <Button type="button" variant="primary" disabled={pending || timeZone === initialTimeZone} onClick={save}>
        {pending ? 'Saving…' : 'Save timezone'}
      </Button>
    </div>
  );
}
