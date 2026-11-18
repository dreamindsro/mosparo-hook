'use server';

import { handleContactForm, type ContactResult } from '@/lib/contact';

export async function sendMessage(
  _previous: ContactResult | null,
  formData: FormData,
): Promise<ContactResult> {
  return handleContactForm(formData);
}
