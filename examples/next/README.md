# Example: Next.js

A Next.js app with a contact form protected by mosparo, in the two ways a form is usually sent:

| Page | Form | Server |
|---|---|---|
| `/` | [`components/fetch-form.tsx`](components/fetch-form.tsx): sent with `fetch()`, reset with `useMosparo()` | [`app/api/contact/route.ts`](app/api/contact/route.ts) |
| `/server-action` | [`components/action-form.tsx`](components/action-form.tsx): `useActionState()` | [`app/server-action/actions.ts`](app/server-action/actions.ts) |

Both verify the submission in [`lib/contact.ts`](lib/contact.ts).

## Run it against your mosparo installation

1. In mosparo, create a project and add `localhost` to its hosts.
2. Copy `.env.example` to `.env.local` and fill in the values of the project.
3. Build the library and start the app:

   ```bash
   # in the repository root
   npm install
   npm run e2e:install

   # in examples/next
   npm run dev
   ```

In your own app, install the package from npm instead: this example installs it from the repository (`file:../..` in `package.json`).

## End-to-end tests

The tests in [`e2e/`](../../e2e) run this app in a browser against a stand-in mosparo server; see the README in the repository root.
