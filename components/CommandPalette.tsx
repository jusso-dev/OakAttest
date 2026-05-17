'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Lightweight command palette. cmd+k opens a search box that filters across
// engagements + admin pages. Server filtering is fine for milestone-1
// volumes; for thousands of engagements we'd move to a server-action
// search.

type Item = { id: string; label: string; description?: string; href: string };

export function CommandPalette({ items }: { items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const filtered = items.filter((i) =>
    !query
      ? true
      : i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.description?.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="mt-24 w-full max-w-xl overflow-hidden rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to engagement, admin, or audit log…"
          className="w-full border-b border-[var(--field-border)] bg-[var(--panel-surface)] px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-600 focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
        />
        <ul className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-600">No matches.</li>
          ) : (
            filtered.slice(0, 30).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 border-b border-[var(--field-border)] px-4 py-3 text-left hover:bg-[var(--oak-mist)]"
                  onClick={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <span className="text-sm font-medium text-slate-900">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-slate-600">{item.description}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-[var(--field-border)] px-4 py-2 text-xs text-slate-600">
          Esc to close · ⌘K to toggle
        </p>
      </div>
    </div>
  );
}
