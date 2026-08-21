import { eq } from 'drizzle-orm';
import { users } from '@/db/schema/auth';
import { db } from '@/lib/db/client';
import { requirePageSession } from '@/lib/auth/session';
import { normaliseTimeZone, supportedTimeZones } from '@/lib/timezone';
import { TimezoneSettingsForm } from '@/components/settings/TimezoneSettingsForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Profile settings · OakAttest' };

export default async function ProfileSettingsPage() {
  const session = await requirePageSession();
  const [profile] = await db
    .select({ timeZone: users.timeZone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const timeZone = normaliseTimeZone(profile?.timeZone);
  const timeZones = Array.from(new Set([timeZone, 'UTC', ...supportedTimeZones()])).sort();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Account</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Profile settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose how dates, times, deadlines, reports, and audit events appear to you.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Date and time</CardTitle>
          <CardDescription>
            Your saved timezone follows you across devices and workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimezoneSettingsForm initialTimeZone={timeZone} timeZones={timeZones} />
        </CardContent>
      </Card>
    </div>
  );
}
