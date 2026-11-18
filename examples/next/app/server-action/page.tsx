import { ActionForm } from '@/components/action-form';

export default function Page() {
  return (
    <>
      <h1>Server action</h1>
      <p>
        The form is sent to a server action, which has mosparo verify it.
      </p>
      <ActionForm />
    </>
  );
}
