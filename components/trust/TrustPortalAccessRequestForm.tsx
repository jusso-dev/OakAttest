'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { requestTrustPortalAccess } from '@/app/actions/trust-portal';
import styles from '@/app/(marketing)/trust/[slug]/trust-portal.module.css';

export function TrustPortalAccessRequestForm({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestTrustPortalAccess({
          slug,
          requesterEmail: String(form.get('requesterEmail') ?? ''),
          requesterOrganisation: String(form.get('requesterOrganisation') ?? ''),
          purpose: String(form.get('purpose') ?? ''),
          website: String(form.get('website') ?? ''),
        });
        setMessage(result.alreadyPending
          ? 'A request from this email address is already waiting for review.'
          : 'Request recorded. The security contact will review it and email any approved access link.');
        if (!result.alreadyPending) formElement.reset();
      } catch (cause) {
        setError((cause as Error).message);
      }
    });
  }

  return (
    <form className={styles.requestForm} onSubmit={submit} aria-busy={pending}>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span>Email address</span>
          <input name="requesterEmail" type="email" autoComplete="email" required disabled={pending} />
        </label>
        <label className={styles.field}>
          <span>Organisation</span>
          <input name="requesterOrganisation" autoComplete="organization" required minLength={2} disabled={pending} />
        </label>
      </div>
      <label className={styles.field}>
        <span>Reason for access</span>
        <textarea name="purpose" required minLength={20} disabled={pending} placeholder="Describe the review, procurement, or assurance need." />
      </label>
      <label className={styles.honeypot} aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <button
        className={styles.action}
        type="submit"
        disabled={pending}
        aria-busy={pending}
        data-state={error ? 'error' : message ? 'success' : 'default'}
      >
        {pending ? 'Recording request…' : 'Request signed PDF'}
      </button>
      <div className={styles.formFeedback} aria-live="polite">
        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
