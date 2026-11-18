# @dreamind-tools/mosparo-hook

[![npm version](https://img.shields.io/npm/v/@dreamind-tools/mosparo-hook)](https://www.npmjs.com/package/@dreamind-tools/mosparo-hook)
[![CI](https://github.com/dreamindsro/mosparo-hook/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamindsro/mosparo-hook/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@dreamind-tools/mosparo-hook)](https://github.com/dreamindsro/mosparo-hook/blob/main/LICENSE)

[mosparo](https://mosparo.io) spam protection for React and Next.js forms: the mosparo box as a component, a hook that follows and controls it, and the verification of the submission on the server.

- `<MosparoField />` renders the mosparo box and loads mosparo's script.
- `useMosparo()` tells you where the box is (`ready`, `checking`, `verified`, ...) and lets you reset it.
- `verifySubmission()` has mosparo verify the submitted form on the server and tells you why when it was not accepted.

Works with forms sent by `fetch()`, with server actions and with mosparo's invisible mode. A complete Next.js app is in [`examples/next`](examples/next).

## Installation

```bash
npm install @dreamind-tools/mosparo-hook
```

React 18 or 19 is required. The server part needs a runtime with Node.js APIs; it is tested on Node.js 22, 24 and 26.

## Quick start

### 1. Configuration

With Next.js, put the values of your mosparo project into environment variables:

```env
NEXT_PUBLIC_MOSPARO_HOST=https://mosparo.example.com
NEXT_PUBLIC_MOSPARO_UUID=your-project-uuid
NEXT_PUBLIC_MOSPARO_PUBLIC_KEY=your-public-key
MOSPARO_PRIVATE_KEY=your-private-key
```

The private key is only read on the server. Without Next.js, pass the values as props and as `config`, see [Other frameworks](#other-frameworks).

### 2. The form

Put `<MosparoField />` inside the form. mosparo holds every submit back until it has checked the form, so your submit handler only runs for a checked form.

```tsx
'use client';

import { MosparoField } from '@dreamind-tools/mosparo-hook';

export function ContactForm() {
  return (
    <form action="/api/contact" method="post">
      <input name="name" />
      <input name="email" type="email" />
      <textarea name="message" />

      <MosparoField />

      <button type="submit">Send</button>
    </form>
  );
}
```

### 3. The server

The check in the browser can be skipped by anyone who sends the request by hand. Verify every submission on the server before you use it:

```ts
import { verifySubmission } from '@dreamind-tools/mosparo-hook/server';

export async function POST(request: Request) {
  const formData = await request.formData();

  const result = await verifySubmission(formData, {
    requiredFields: ['name', 'email', 'message'],
  });

  if (!result.valid) {
    console.warn('mosparo:', result.code, result.message);
    return Response.json({ error: 'Spam protection failed.' }, { status: 422 });
  }

  // Use the submission...
  return Response.json({ ok: true });
}
```

## Following and resetting the box: `useMosparo()`

mosparo accepts the tokens of a checked form once. A form that stays on the page after a submit, as most forms sent with `fetch()` do, needs new ones before it can be sent again. `useMosparo()` gives you `reset()` for that, and the status of the box:

```tsx
'use client';

import { MosparoField, useMosparo } from '@dreamind-tools/mosparo-hook';

export function ContactForm() {
  const mosparo = useMosparo();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    const response = await fetch('/api/contact', {
      method: 'POST',
      body: new FormData(form),
    });

    if (response.ok) {
      form.reset(); // emptying the form also resets mosparo
    } else {
      mosparo.reset(); // the form stays, its tokens are used up
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" />
      <MosparoField {...mosparo.field} />
      <button type="submit" disabled={mosparo.status === 'checking'}>
        Send
      </button>
    </form>
  );
}
```

| Returned | |
|---|---|
| `field` | Props to spread onto the `<MosparoField>` the hook belongs to |
| `status` | `loading`: script or submit token is being fetched<br>`ready`: waiting for the visitor<br>`checking`: mosparo is checking the form<br>`verified`: the form can be submitted<br>`invalid`: mosparo rejected the form<br>`error`: the box cannot work: mosparo is unreachable, the keys are wrong, or the host of your site is not allowed in the mosparo project |
| `isVerified` | `status === 'verified'` |
| `reset()` | Clear the check and fetch a new submit token |
| `check()` | Check the form now, as if the visitor ticked the box |
| `getTokens()` | `{ submitToken, validationToken }` of a checked form, otherwise `null`. For sending JSON instead of the form itself. |

The same three methods are available through a ref: `<MosparoField ref={ref} />` with `useRef<MosparoHandle>(null)`.

**Server actions.** React empties a form when its action is done, and mosparo starts over whenever its form is emptied. A form with `action={serverAction}` needs no `reset()`.

**Changing a field** after the check makes mosparo drop the check: the status goes back to `ready` and the visitor ticks the box again. This is how mosparo makes sure that what it checked is what gets sent.

## Invisible mode

When the mosparo project is set to invisible mode, there is no box: mosparo checks the form when it is submitted and then submits it. Nothing changes in your code. The checked form is submitted with `form.requestSubmit()`, so submit handlers and server actions run as usual.

## `<MosparoField>` props

| Prop | Type | |
|---|---|---|
| `host` | `string` | URL of the mosparo installation. Default: `NEXT_PUBLIC_MOSPARO_HOST` |
| `uuid` | `string` | UUID of the project. Default: `NEXT_PUBLIC_MOSPARO_UUID` |
| `publicKey` | `string` | Public key of the project. Default: `NEXT_PUBLIC_MOSPARO_PUBLIC_KEY` |
| `options` | `MosparoOptions` | [Options of the mosparo widget](https://documentation.mosparo.io/docs/integration/custom#parameters-of-the-mosparo-class): `language`, `designMode`, `inputFieldSelector`, `customMessages`, the multi-step options, ... |
| `callbacks` | `MosparoCallbacks` | mosparo's callbacks: `onCheckForm(valid)`, `onResetState()`, `onAbortSubmit()`, `onGetFormData(form, formData)`, ... |
| `invisibleCallbacks` | `MosparoInvisibleCallbacks` | Callbacks of invisible mode. `doSubmitFormInvisible` replaces how the checked form is submitted. |
| `onStatusChange` | `(status) => void` | Called when the status changes. `useMosparo()` uses this. |
| `onError` | `(error: Error) => void` | The script could not be loaded, or the box could not start |
| `nonce` | `string` | Nonce for the script tag, see [Content Security Policy](#content-security-policy) |
| `id`, `className`, `style` | | For the element around the box |

The box has to be inside a `<form>`. mosparo watches the fields that exist when the box is created. If your form adds fields later, give `<MosparoField>` a `key` that changes with them, so that the box is created again.

## `verifySubmission(data, options?)`

`data` is the submitted form: a `FormData`, a `Request`, or a plain object for a JSON body. The function never throws for a submission it cannot accept; it returns `valid: false` with a `code`. Treat everything but `valid: true` as "do not use this submission".

| Option | |
|---|---|
| `requiredFields` | Names of the fields mosparo must have verified. **Set this.** The mosparo box does not read every kind of field (see below), so without it a bot can keep its text away from your spam rules, for example by turning a text field into a password field. mosparo calls this [bypass protection](https://documentation.mosparo.io/docs/integration/bypass_protection). |
| `ignoredFields` | Names of fields that are never sent to mosparo |
| `timeoutMs` | How long to wait for mosparo. Default: 10000 |
| `config` | `{ host, publicKey, privateKey }`. Default: the environment variables `MOSPARO_HOST`, `MOSPARO_PUBLIC_KEY` (or their `NEXT_PUBLIC_` variants) and `MOSPARO_PRIVATE_KEY` |

```ts
type VerifySubmissionResult =
  | { valid: true; verifiedFields: Record<string, 'valid' | 'invalid'>; issues: MosparoIssue[] }
  | { valid: false; code: VerifyFailureCode; message: string; verifiedFields: ...; issues: MosparoIssue[] };
```

| `code` | |
|---|---|
| `rejected` | mosparo did not accept the submission: spam, data changed after the check, or tokens that were used before |
| `unverified-field` | A field in `requiredFields` was not verified by mosparo |
| `missing-tokens` | The submission has no mosparo tokens: the box did not check it |
| `timeout` | mosparo did not answer in time |
| `request-failed` | mosparo could not be reached, or the keys are wrong |
| `missing-config` | No `config` and no environment variables |

`message` holds details for your logs. Do not show it to visitors.

### Which fields are verified

The mosparo box reads text fields, textareas and selects. It [skips](https://documentation.mosparo.io/docs/integration/ignored_fields) checkboxes, radio buttons, hidden fields, password fields and file uploads. On the server:

- Every field the box read has to arrive unchanged, otherwise the submission is `rejected`.
- Fields the box skipped are not verified. Sending them along does no harm, but mosparo receives a hash of each value. Keep secrets out with `ignoredFields`:

  ```ts
  await verifySubmission(formData, { ignoredFields: ['password', 'csrfToken'] });
  ```

- Uploaded files, mosparo's own fields and the hidden fields React adds for server actions are left out automatically.
- Several fields with one name, and names ending in `[]`, are verified as a list. Give a `<select multiple>` a name ending in `[]`.

## Other frameworks

Nothing in the package depends on Next.js. Only the defaults do: the `NEXT_PUBLIC_MOSPARO_*` variables are a Next.js convention.

**React without Next.js** (React Router, Vite, ...): pass the project as props.

```tsx
<MosparoField
  host={import.meta.env.VITE_MOSPARO_HOST}
  uuid={import.meta.env.VITE_MOSPARO_UUID}
  publicKey={import.meta.env.VITE_MOSPARO_PUBLIC_KEY}
/>
```

**Any server** that gives you a `Request` or `FormData`: `verifySubmission()` takes it as it is.

```ts
// React Router action
export async function action({ request }: ActionFunctionArgs) {
  const result = await verifySubmission(request, { requiredFields: ['message'] });
  // ...
}
```

**Without React**: the `core` entry has what the component is built from. Adapters for other frameworks are planned on top of it.

```ts
import { createMosparoWidget, loadMosparoScript } from '@dreamind-tools/mosparo-hook/core';

await loadMosparoScript(host);
const widget = createMosparoWidget(document.querySelector('#mosparo')!, { host, uuid, publicKey });

widget.subscribe((status) => console.log(status));
widget.reset();
widget.destroy();
```

## Security notes

- **Verify on the server, always.** The box in the browser is a convenience for the visitor, not a protection.
- **Set `requiredFields`**, see above.
- **The private key stays on the server.** Never put it in a `NEXT_PUBLIC_` variable. `verifySubmission()` refuses to run in a browser.
- **A failed verification is a rejection.** When mosparo is down, `verifySubmission()` returns `valid: false`; decide for yourself whether your form should then accept the message anyway.
- **Self-signed certificate** on the mosparo host: certificate checks cannot be turned off. Make Node.js trust your certificate authority with [`NODE_EXTRA_CA_CERTS`](https://nodejs.org/api/cli.html#node_extra_ca_certsfile).

### Content Security Policy

mosparo loads a script and a stylesheet from its host and sends its requests there. Allow the host in `script-src`, `style-src`, `connect-src` and `img-src`, as the [mosparo documentation](https://documentation.mosparo.io/docs/integration/csp) describes. For a policy that allows scripts by nonce, pass the nonce to the field: `<MosparoField nonce={nonce} />`.

Subresource Integrity is not available for mosparo's script: a stock mosparo installation serves it without the CORS header that browsers require for an integrity check.

## Upgrading from 0.5

See [CHANGELOG.md](CHANGELOG.md#100).

## Development

```bash
npm install
npm test            # unit and integration tests (Vitest)
npm run typecheck
npm run build       # bundle to dist/ with tsup

npm run e2e:install # once, and after changing the library: build it and install the example app
npx playwright install chromium
npm run test:e2e    # the example app in a real browser (Playwright)
```

None of the tests need a mosparo installation. They run mosparo's own frontend script (kept in `tests/fixtures`) against a stand-in mosparo server (`tests/fake-mosparo`) that issues, signs and verifies tokens like mosparo does; the server-side tests go through the real `@mosparo/api-client`. CI runs the unit tests on Node.js 22, 24 and 26 and the end-to-end tests on Node.js 24.

## License

MIT
