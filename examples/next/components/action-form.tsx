'use client';

import { MosparoField, useMosparo } from '@dreamind-tools/mosparo-hook';
import { useActionState } from 'react';
import { sendMessage } from '@/app/server-action/actions';
import { ContactFields } from './fields';

/** A form that is sent to a server action. */
export function ActionForm() {
  const mosparo = useMosparo();
  const [result, formAction, pending] = useActionState(sendMessage, null);

  // React empties the form when the action is done, and mosparo starts over
  // whenever its form is emptied. Nothing to reset by hand here.
  return (
    <form action={formAction}>
      <ContactFields />

      <MosparoField {...mosparo.field} />

      <button type="submit" disabled={pending || mosparo.status === 'checking'}>
        {pending ? 'Sending…' : 'Send'}
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
