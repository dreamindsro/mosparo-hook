# @dreamind-tools/mosparo-hook

[![npm version](https://img.shields.io/npm/v/@dreamind-tools/mosparo-hook)](https://www.npmjs.com/package/@dreamind-tools/mosparo-hook)
[![CI](https://github.com/dreamindsro/mosparo-hook/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamindsro/mosparo-hook/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@dreamind-tools/mosparo-hook)](https://github.com/dreamindsro/mosparo-hook/blob/main/LICENSE)

React/Next.js integration for [mosparo](https://mosparo.io) spam protection.

## Installation

```bash
npm install @dreamind-tools/mosparo-hook
```

### Peer dependencies

- `react` ^18 or ^19
- `@mosparo/api-client` ^1.2.0 (only needed for server-side verification)

## Setup

### Environment variables

The simplest way to configure the package is via environment variables. No props needed.

```env
NEXT_PUBLIC_MOSPARO_HOST=https://mosparo.example.com
NEXT_PUBLIC_MOSPARO_UUID=your-project-uuid
NEXT_PUBLIC_MOSPARO_PUBLIC_KEY=your-public-key
MOSPARO_PRIVATE_KEY=your-private-key
```

The first three are used by both the client component and server verification. The private key is server-only and never exposed to the browser. You can find these values in your mosparo project settings.

## Usage

### Client: `<MosparoField />`

Drop the component into any form. It renders the mosparo captcha widget and automatically loads the mosparo frontend script.

```tsx
import { MosparoField } from '@dreamind-tools/mosparo-hook';

export function ContactForm() {
  return (
    <form action="/api/contact" method="POST">
      <input name="name" placeholder="Name" />
      <input name="email" placeholder="Email" />
      <textarea name="message" placeholder="Message" />

      <MosparoField />

      <button type="submit">Send</button>
    </form>
  );
}
```

If you prefer passing config via props instead of environment variables:

```tsx
<MosparoField
  host="https://mosparo.example.com"
  uuid="your-project-uuid"
  publicKey="your-public-key"
/>
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `host` | `string` | mosparo instance URL |
| `uuid` | `string` | Project UUID |
| `publicKey` | `string` | Project public key |
| `options` | `MosparoOptions` | Widget options (language, design mode, etc.) |
| `callbacks` | `MosparoCallbacks` | Lifecycle callbacks |
| `invisibleCallbacks` | `MosparoInvisibleCallbacks` | Invisible mode callbacks |
| `id` | `string` | Custom container element ID |
| `className` | `string` | CSS class for the container |
| `style` | `CSSProperties` | Inline styles for the container |
| `onError` | `(error: Error) => void` | Called if widget initialization fails |

### Server: `verifySubmission()`

Verify form submissions on the server using `@mosparo/api-client` under the hood.

```ts
import { verifySubmission } from '@dreamind-tools/mosparo-hook/server';
```

#### Next.js Server Action

```ts
'use server';

import { verifySubmission } from '@dreamind-tools/mosparo-hook/server';

export async function submitContact(formData: FormData) {
  const result = await verifySubmission(formData);

  if (!result.valid) {
    return { error: result.error ?? 'Spam detected.' };
  }

  // Process the form...
}
```

#### Next.js API Route

```ts
import { verifySubmission } from '@dreamind-tools/mosparo-hook/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const result = await verifySubmission(formData);

  if (!result.valid) {
    return Response.json({ error: 'Verification failed.' }, { status: 422 });
  }

  // Process the form...
  return Response.json({ success: true });
}
```

#### With explicit config

```ts
const result = await verifySubmission(formData, {
  config: {
    host: 'https://mosparo.example.com',
    uuid: 'your-project-uuid',
    publicKey: 'your-public-key',
    privateKey: 'your-private-key',
  },
  excludeFields: ['honeypot'],
});
```

#### Return type

```ts
interface VerifySubmissionResult {
  success: boolean;          // Whether the API call succeeded
  valid: boolean;            // Whether the submission passed verification
  verifiedFields: Record<string, string>;
  issues: unknown[];
  error?: string;            // Error message if success is false
}
```

## Development

```bash
npm install
npm test            # run the tests once (Vitest)
npm run test:watch  # re-run tests on change
npm run typecheck
npm run build       # bundle to dist/ with tsup
```

The tests live in `tests/` and run without a mosparo instance: the widget script and `@mosparo/api-client` are mocked. CI runs typecheck, tests and build on Node.js 22, 24 and 26.

## License

MIT
