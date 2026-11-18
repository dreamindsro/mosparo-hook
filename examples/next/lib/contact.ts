import {
  verifySubmission,
  type VerifySubmissionResult,
} from '@dreamind-tools/mosparo-hook/server';

export interface ContactResult {
  ok: boolean;
  /** Text for the visitor. */
  message: string;
}

/**
 * Verify a submitted contact form with mosparo and "send" it. Both example
 * forms end up here: one through a route handler, one through a server action.
 */
export async function handleContactForm(formData: FormData): Promise<ContactResult> {
  const verification = await verifySubmission(formData, {
    // The fields the spam rules have to have seen. Without this, a bot could
    // hide its text from mosparo by changing the type of a field.
    requiredFields: ['name', 'email', 'message'],
  });

  if (!verification.valid) {
    // The details are for the server log, not for the visitor.
    console.warn(`mosparo: ${verification.code}: ${verification.message}`);
    return { ok: false, message: visitorMessage(verification) };
  }

  // Send the email, store the message, ...
  return { ok: true, message: `Thank you, ${formData.get('name')}!` };
}

function visitorMessage(
  verification: Extract<VerifySubmissionResult, { valid: false }>,
): string {
  switch (verification.code) {
    case 'timeout':
    case 'request-failed':
    case 'missing-config':
      return 'The spam protection is not available right now. Please try again later.';
    default:
      return 'The spam protection did not accept the form. Please try again.';
  }
}
