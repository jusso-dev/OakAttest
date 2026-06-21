'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/actions/notifications';

type Item = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationList({ items }: { items: Item[] }) {
  const router = useRouter();

  async function open(item: Item) {
    if (!item.readAt) await markNotificationReadAction({ id: item.id });
    if (item.link) router.push(item.link);
    else router.refresh();
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-600">No notifications.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={markAll}>
          Mark all read
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => open(n)}
              className={`flex w-full flex-col gap-0.5 rounded-md border p-3 text-left transition-colors ${
                n.readAt
                  ? 'border-[var(--field-border)] bg-[var(--panel-surface)]'
                  : 'border-[var(--oak-border)] bg-[var(--oak-mist)]'
              } hover:bg-[var(--oak-mist)]`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-950">
                  {!n.readAt && (
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--oak-shield)] align-middle" aria-label="unread" />
                  )}
                  {n.title}
                </span>
                <time className="text-xs text-slate-500" dateTime={n.createdAt}>
                  {new Date(n.createdAt).toLocaleString('en-AU')}
                </time>
              </div>
              {n.body && <span className="text-sm text-slate-700">{n.body}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
