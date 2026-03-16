# @dreamindsro/mosparo-hook

React/Next.js integration for [mosparo](https://mosparo.io) spam protection.

## Installation

```bash
npm install @dreamindsro/mosparo-hook
```

> Since this package is hosted on GitHub Packages, add an `.npmrc` to your project root:
>
> ```
> @dreamindsro:registry=https://npm.pkg.github.com
> ```

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
import { MosparoField } from '@dreamindsro/mosparo-hook';

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
import { verifySubmission } from '@dreamindsro/mosparo-hook/server';
```

#### Next.js Server Action

```ts
'use server';

import { verifySubmission } from '@dreamindsro/mosparo-hook/server';

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
import { verifySubmission } from '@dreamindsro/mosparo-hook/server';

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

## License

MIT
