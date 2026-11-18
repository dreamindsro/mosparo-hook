import { FetchForm } from '@/components/fetch-form';

export default function Page() {
  return (
    <>
      <h1>Fetch + route handler</h1>
      <p>
        The form is sent with <code>fetch()</code> to <code>/api/contact</code>,
        which has mosparo verify it.
      </p>
      <FetchForm />
    </>
  );
}
