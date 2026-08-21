'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MentionTextarea, type DirectoryUser } from './MentionTextarea';
import { postEngagementNote } from '@/app/actions/notes';
import { toggleEngagementWatch } from '@/app/actions/engagement-watch';
import { UserDateTime } from '@/components/timezone/UserTimezone';

type Audience = 'assessor' | 'client';
type Note = {
  id: string;
  audience: Audience;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
};
type Tab = {
  audience: Audience;
  label: string;
  description: string;
  directory: DirectoryUser[];
  notes: Note[];
};

function ThreadPanel({
  engagementId,
  tab,
}: {
  engagementId: string;
  tab: Tab;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Keep only mention ids whose @Name token still appears in the body.
      const present = mentioned.filter((id) => {
        const u = tab.directory.find((d) => d.id === id);
        return u ? body.includes(`@${u.name}`) : false;
      });
      await postEngagementNote({
        engagementId,
        audience: tab.audience,
        body,
        mentionedUserIds: present,
      });
      setBody('');
      setMentioned([]);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {tab.notes.length === 0 ? (
          <li className="text-sm text-slate-600">No messages yet. Start the conversation.</li>
        ) : (
          tab.notes.map((n) => (
            <li key={n.id} className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-950">
                  {n.author.name ?? n.author.email}
                </span>
                <span className="text-xs text-slate-500"><UserDateTime value={n.createdAt} /></span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2">
        <MentionTextarea
          value={body}
          onChange={setBody}
          members={tab.directory}
          onMention={(u) => setMentioned((cur) => (cur.includes(u.id) ? cur : [...cur, u.id]))}
          placeholder="Write a message… use @ to mention a teammate"
          disabled={busy}
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end">
          <Button variant="primary" size="sm" disabled={busy || !body.trim()} onClick={post}>
            {busy ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DiscussionThread({
  engagementId,
  tabs,
  watch,
}: {
  engagementId: string;
  tabs: Tab[];
  watch?: { watching: boolean };
}) {
  const router = useRouter();
  const [active, setActive] = useState<Audience>(tabs[0]?.audience ?? 'assessor');
  const [watching, setWatching] = useState(watch?.watching ?? false);
  const [watchBusy, setWatchBusy] = useState(false);

  if (tabs.length === 0) return null;
  const current = tabs.find((t) => t.audience === active) ?? tabs[0];

  async function toggleWatch() {
    setWatchBusy(true);
    try {
      const next = !watching;
      await toggleEngagementWatch({ engagementId, watch: next });
      setWatching(next);
      router.refresh();
    } finally {
      setWatchBusy(false);
    }
  }

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Discussion</CardTitle>
            <CardDescription>{current.description}</CardDescription>
          </div>
          {watch && (
            <Button variant="outline" size="sm" disabled={watchBusy} onClick={toggleWatch}>
              {watching ? '✓ Watching' : 'Watch engagement'}
            </Button>
          )}
        </div>
        {tabs.length > 1 && (
          <div className="mt-3 flex gap-1 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-1">
            {tabs.map((t) => (
              <button
                key={t.audience}
                type="button"
                onClick={() => setActive(t.audience)}
                className={`flex-1 rounded px-3 py-1.5 text-sm ${
                  active === t.audience
                    ? 'bg-[var(--oak-mist)] font-medium text-[var(--oak-shield)]'
                    : 'text-slate-600 hover:bg-[var(--oak-mist)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ThreadPanel engagementId={engagementId} tab={current} />
      </CardContent>
    </Card>
  );
}
