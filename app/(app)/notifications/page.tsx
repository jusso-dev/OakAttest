import { requirePageSession } from '@/lib/auth/session';
import { listNotifications } from '@/lib/notifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NotificationList } from '@/components/collaboration/NotificationList';

export const metadata = { title: 'Notifications · OakAttest' };

export default async function NotificationsPage() {
  const session = await requirePageSession();
  const rows = await listNotifications(session.user.id, 100);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Inbox</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Notifications</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Recent</CardTitle>
          <CardDescription>Mentions, new evidence, and engagement updates you watch.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationList
            items={rows.map((n) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              link: n.link,
              readAt: n.readAt ? n.readAt.toISOString() : null,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
