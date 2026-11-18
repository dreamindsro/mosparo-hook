'use client';

import { MosparoField, useMosparo } from '@dreamind-tools/mosparo-hook';
import { useState, type FormEvent } from 'react';
import type { ContactResult } from '@/lib/contact';
import { ContactFields } from './fields';

/** A form that is sent with fetch() to a route handler. */
export function FetchForm() {
  const mosparo = useMosparo();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ContactResult | null>(null);

  // By the time this runs, mosparo has checked the form: it holds every
  // submit back until then.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setSending(true);
    setResult(null);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        body: new FormData(form),
      });
      const body: ContactResult = await response.json();
      setResult(body);

      if (body.ok) {
        // Emptying the form also makes mosparo start over.
        form.reset();
      } else {
        // The form stays as it is, but its tokens are used up.
        mosparo.reset();
      }
    } catch {
      setResult({ ok: false, message: 'The message could not be sent.' });
      mosparo.reset();
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <ContactFields />

      <MosparoField {...mosparo.field} />

      <button type="submit" disabled={sending || mosparo.status === 'checking'}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      {result && (
        <p role={result.ok ? 'status' : 'alert'} data-testid="form-result">
          {result.message}
        </p>
      )}
      <p>
        <small>
          mosparo: <span data-testid="mosparo-status">{mosparo.status}</span>
        </small>
      </p>
    </form>
  );
}
