'use client';

import { useMemo, useRef, useState } from 'react';

export type DirectoryUser = { id: string; name: string; email: string };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// Plain-text textarea with an @-mention autocomplete. Text is controlled by the
// caller; a picked user is reported via `onMention` so the caller can track ids
// for persistence/notification. The inserted token is `@Full Name`.
export function MentionTextarea({
  value,
  onChange,
  members,
  onMention,
  id,
  rows = 3,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  members: DirectoryUser[];
  onMention?: (user: DirectoryUser) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(() => {
    if (mentionQuery === null) return [];
    return members
      .filter(
        (user) =>
          user.name.toLowerCase().includes(mentionQuery) ||
          user.email.toLowerCase().includes(mentionQuery),
      )
      .slice(0, 6);
  }, [mentionQuery, members]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    const match = next.slice(0, caret).match(/@([^\s@]*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  }

  function pick(user: DirectoryUser) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@([^\s@]*)$/, `@${user.name} `);
    const after = value.slice(caret);
    onChange(before + after);
    onMention?.(user);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:opacity-70"
      />
      {matches.length > 0 ? (
        <ul className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] shadow-md">
          {matches.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--oak-mist)]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(user);
                }}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--oak-mist)] text-[10px] font-semibold text-[var(--oak-shield)]">
                  {initials(user.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-950">{user.name}</span>
                  <span className="block truncate text-xs text-slate-600">{user.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
