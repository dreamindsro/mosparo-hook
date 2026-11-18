import { handleContactForm } from '@/lib/contact';

export async function POST(request: Request) {
  const result = await handleContactForm(await request.formData());

  return Response.json(result, { status: result.ok ? 200 : 422 });
}
