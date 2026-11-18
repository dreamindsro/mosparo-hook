# Changelog

## 1.0.0

Not released yet.

### Added

- `useMosparo()`: the status of the box (`loading`, `ready`, `checking`, `verified`, `invalid`, `error`) and `reset()`, `check()` and `getTokens()`. The same methods are available through a ref on `<MosparoField>`.
- `reset()` fetches a new submit token. A form that stays on the page after a submit needs it, because mosparo accepts a token once.
- `verifySubmission()`: `requiredFields` (bypass protection), `timeoutMs` (default 10 seconds), a `Request` as input, and a `code` that says why a submission was not accepted.
- `<MosparoField>`: `onStatusChange`, `nonce`. `onError` is now also called when the script cannot be loaded and when the field is not inside a form.
- The `core` entry: the framework-independent script loader and widget.
- Types for mosparo's multi-step options and callbacks.
- An example app (`examples/next`) and end-to-end tests in a real browser.

### Fixed

- An `options` object written inline no longer replaces the box, and with it the visitor's check, on every render.
- In invisible mode the checked form is submitted with `requestSubmit()`. Before, a form whose submit button was disabled at that moment was never submitted, and a form without a submit button skipped its submit handler.
- Fields whose name starts with `_` are verified. They used to be left out on the server, which made mosparo reject every form that had such a text field.
- The box renders the same on the server and in the browser when only server-side `MOSPARO_*` variables are set (it renders nothing; the browser cannot read them).
- The package no longer fails in bundlers that do not define `process`.

### Changed: what to do when upgrading from 0.5

- **`@mosparo/api-client`** is now a dependency of this package (version 2). You can remove it from your own `package.json`.
- **`excludeFields` is now `ignoredFields`.** You no longer need it for checkboxes, radio buttons or hidden fields: mosparo ignores fields its box did not read. Keep it for secrets, and add `requiredFields`.
- **The result of `verifySubmission()`** no longer has `success` and `error`. Check `valid`; on failure read `code` and `message`.

  ```diff
  - if (!result.valid) return { error: result.error ?? 'Verification failed.' };
  + if (!result.valid) {
  +   console.warn('mosparo:', result.code, result.message);
  +   return { error: 'Verification failed.' };
  + }
  ```

- **`verifySsl` and `MOSPARO_VERIFY_SSL` are gone.** For a mosparo host with a self-signed certificate, set `NODE_EXTRA_CA_CERTS`.
- **Callback signatures** follow mosparo: `onBeforeGetFormData(form)`, `onGetFormData(form, formData)` (has to return the form data), `onGetFieldValue(field, value)`, `onValidateFormInvisible()`.
- **Server types** (`VerifySubmissionOptions`, `VerifySubmissionResult`, `MosparoServerConfig`) are exported from `@dreamind-tools/mosparo-hook/server` only.
- **In the browser** only `NEXT_PUBLIC_MOSPARO_*` variables are read. On the server, `uuid` and `MOSPARO_UUID` are no longer needed.
- **`<MosparoField>` has to be inside a `<form>`.** Outside of one it now reports an error instead of rendering a box that does nothing.

## 0.5.5

Not released yet.

### Fixed

- A form could never be submitted once its mosparo box had been created a second time: under React's StrictMode, after a re-render with a new `options` object, or after a change of project.
- `onCheckForm` receives whether the form is valid.
- The `verifySsl` option had no effect.
- A script that failed to load could not be loaded again.
- Without configuration, a script was requested from the page's own origin.
- The reason of a failed verification was reported as "Unknown verification error".
