'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  FileText,
  LoaderCircle,
  Maximize2,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { BurlAvatar } from '@/components/burl/BurlAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BurlAttachmentSummary, BurlChatMessage } from '@/lib/burl/types';
import type { BurlEngagementOption } from '@/lib/burl/context';

type UiMessage = BurlChatMessage & {
  id: string;
  meta?: string;
};

const starters = [
  'What evidence would you expect for this control?',
  'Map this PDF evidence to likely ISM controls.',
  'Draft a client evidence request for MFA coverage.',
];

export function BurlAssistant({
  mode,
  engagements = [],
}: {
  mode: 'popup' | 'page';
  engagements?: BurlEngagementOption[];
}) {
  const pathname = usePathname();
  const inferredEngagementId = useMemo(() => engagementIdFromPath(pathname), [pathname]);
  const [open, setOpen] = useState(mode === 'page');
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'I can help interpret ISM requirements, draft evidence requests, and suggest evidence-to-control mappings for assessor review.',
    },
  ]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedEngagementId, setSelectedEngagementId] = useState(inferredEngagementId ?? '');
  const effectiveEngagementId = inferredEngagementId ?? selectedEngagementId;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  if (mode === 'popup' && pathname === '/burl') return null;

  async function sendMessage(event?: FormEvent<HTMLFormElement>, starter?: string) {
    event?.preventDefault();
    const content = (starter ?? input).trim();
    if (!content || busy) return;

    setBusy(true);
    setError(null);
    setInput('');
    setStatus(file ? 'Reading PDF evidence and engagement context...' : 'Preparing engagement context...');

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      meta: file ? file.name : undefined,
    };
    const nextMessages = [...messages, userMessage];
    const assistantId = crypto.randomUUID();
    setMessages([
      ...nextMessages,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
      },
    ]);

    try {
      const formData = new FormData();
      formData.set(
        'messages',
        JSON.stringify(
          nextMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(-12)
            .map(({ role, content }) => ({ role, content })),
        ),
      );
      if (effectiveEngagementId) formData.set('engagementId', effectiveEngagementId);
      if (file) formData.set('file', file);

      const response = await fetch('/api/burl/chat/stream', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Burl could not answer.');
      }
      if (!response.body) {
        throw new Error('Burl did not return a response stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let received = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        received += chunk;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: message.content + chunk } : message,
          ),
        );
      }

      const finalChunk = decoder.decode();
      if (finalChunk) {
        received += finalChunk;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: message.content + finalChunk } : message,
          ),
        );
      }

      const attachment = parseAttachmentHeader(response.headers.get('X-Burl-Attachment'));
      if (attachment || !received.trim()) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content || 'Burl did not return any text.',
                  meta: attachment
                    ? `${attachment.filename}, ${attachment.extractedCharacters.toLocaleString()} characters read`
                    : undefined,
                }
              : message,
          ),
        );
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus(null);
      setBusy(false);
    }
  }

  const panel = (
    <section
      className={cn(
        'flex min-h-0 flex-col border border-[var(--field-border)] bg-[var(--panel-surface)] shadow-xl',
        mode === 'popup'
          ? 'fixed bottom-5 right-5 z-50 h-[min(640px,calc(100dvh-40px))] w-[min(420px,calc(100vw-32px))] rounded-lg'
          : 'h-[calc(100dvh-12rem)] min-h-[620px] rounded-lg shadow-sm',
      )}
      aria-label="Burl assistant"
    >
      <header className="flex items-center gap-3 border-b border-[var(--field-border)] px-4 py-3">
        <BurlAvatar className="h-10 w-10" priority={mode === 'page'} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-950">Burl</h2>
          <p className="truncate text-xs text-slate-600">Evidence and ISM helper</p>
        </div>
        {mode === 'popup' ? (
          <>
            <Link
              href="/burl"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
              aria-label="Open Burl screen"
              title="Open Burl screen"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
              aria-label="Close Burl"
              title="Close Burl"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <Bot className="h-5 w-5 text-[var(--oak-shield)]" />
        )}
      </header>

      <div className="border-b border-[var(--field-border)] px-4 py-3">
        <label className="text-xs font-medium text-slate-700" htmlFor={`${mode}-burl-engagement`}>
          Use context from
        </label>
        <select
          id={`${mode}-burl-engagement`}
          value={effectiveEngagementId}
          onChange={(event) => setSelectedEngagementId(event.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
          disabled={Boolean(inferredEngagementId && mode === 'popup')}
        >
          <option value="">General ISM guidance</option>
          {engagements.map((engagement) => (
            <option key={engagement.id} value={engagement.id}>
              {engagement.reference ? `${engagement.reference} - ${engagement.name}` : engagement.name}
            </option>
          ))}
          {inferredEngagementId && !engagements.some((engagement) => engagement.id === inferredEngagementId) && (
            <option value={inferredEngagementId}>Current engagement</option>
          )}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                'max-w-[92%] rounded-md border px-3 py-2 text-sm leading-6',
                message.role === 'user'
                  ? 'ml-auto border-[var(--oak-border)] bg-[var(--oak-mist)] text-slate-950'
                  : 'border-[var(--field-border)] bg-white text-slate-800',
              )}
            >
              {message.role === 'assistant' ? (
                <BurlMarkdown content={message.content} />
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
              {message.meta && <p className="mt-2 text-xs text-slate-600">{message.meta}</p>}
            </article>
          ))}

          {messages.length === 1 && (
            <div className="grid gap-2 pt-1">
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => sendMessage(undefined, starter)}
                  className="rounded-md border border-[var(--field-border)] px-3 py-2 text-left text-xs text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
                >
                  {starter}
                </button>
              ))}
            </div>
          )}

          {status && (
            <p className="rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-xs text-slate-600">
              {status}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={sendMessage} className="border-t border-[var(--field-border)] p-3">
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] px-3 py-2 text-xs text-slate-700">
            <FileText className="h-4 w-4 text-[var(--oak-shield)]" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="rounded text-slate-600 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
              aria-label="Remove PDF"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask about evidence, ISM controls, or attach a PDF..."
            className="min-h-10 flex-1 resize-none rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-950 shadow-sm placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
            rows={mode === 'page' ? 3 : 2}
            disabled={busy}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--field-border)] text-slate-700 hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:opacity-50"
            disabled={busy}
            aria-label="Attach PDF"
            title="Attach PDF"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <Button
            type="submit"
            variant="primary"
            className="h-10 w-10 shrink-0 px-0"
            disabled={busy || !input.trim()}
            aria-label="Send to Burl"
            title="Send to Burl"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </section>
  );

  if (mode === 'page') return panel;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border border-[var(--oak-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm font-medium text-slate-950 shadow-lg hover:bg-[var(--oak-mist)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]"
          aria-label="Open Burl"
        >
          <BurlAvatar className="h-9 w-9" />
          <span>Ask Burl</span>
        </button>
      )}
      {open && panel}
    </>
  );
}

function engagementIdFromPath(pathname: string | null) {
  const match = pathname?.match(/\/engagements\/([0-9a-f-]{36})(?:\/|$)/i);
  return match?.[1];
}

function parseAttachmentHeader(value: string | null): BurlAttachmentSummary | null {
  if (!value) return null;
  try {
    return JSON.parse(decodeURIComponent(value)) as BurlAttachmentSummary;
  } catch {
    return null;
  }
}

function BurlMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ ...props }) => <h3 className="mb-2 text-base font-semibold text-slate-950" {...props} />,
        h2: ({ ...props }) => <h4 className="mb-2 mt-3 text-sm font-semibold text-slate-950" {...props} />,
        h3: ({ ...props }) => <h5 className="mb-1 mt-3 text-sm font-semibold text-slate-950" {...props} />,
        p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
        ul: ({ ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
        ol: ({ ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
        li: ({ ...props }) => <li className="pl-1" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold text-slate-950" {...props} />,
        code: ({ ...props }) => (
          <code className="rounded bg-[var(--oak-mist)] px-1 py-0.5 font-mono text-xs text-slate-900" {...props} />
        ),
        pre: ({ ...props }) => (
          <pre className="mb-2 overflow-x-auto rounded-md bg-[var(--oak-mist)] p-3 text-xs text-slate-900" {...props} />
        ),
        table: ({ ...props }) => (
          <div className="mb-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs" {...props} />
          </div>
        ),
        th: ({ ...props }) => (
          <th className="border border-[var(--field-border)] bg-[var(--oak-mist)] px-2 py-1 text-left font-semibold" {...props} />
        ),
        td: ({ ...props }) => <td className="border border-[var(--field-border)] px-2 py-1" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
