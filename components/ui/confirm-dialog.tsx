'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type ButtonVariant = 'default' | 'primary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

// A button that opens a confirmation modal before running `onConfirm`. Use for
// every destructive or irreversible action. `onConfirm` may be async; the
// confirm button shows a busy state and the modal stays open if it throws,
// surfacing the error.
export function ConfirmButton({
  onConfirm,
  triggerLabel,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  confirmVariant,
  size = 'md',
  disabled = false,
  className,
}: {
  onConfirm: () => void | Promise<void>;
  triggerLabel: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  // Move focus into the dialog on open and restore it to the trigger on close.
  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement | null;
      confirmRef.current?.focus();
    } else {
      previousFocus.current?.focus?.();
    }
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className={className}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[var(--field-border)] bg-[var(--panel-surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            <div className="mt-2 text-sm leading-6 text-slate-700">{description}</div>
            {error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <Button
                ref={confirmRef}
                type="button"
                variant={confirmVariant ?? (variant === 'destructive' ? 'destructive' : 'primary')}
                disabled={busy}
                onClick={confirm}
              >
                {busy ? 'Working…' : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
