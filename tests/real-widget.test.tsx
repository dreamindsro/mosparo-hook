import { act, cleanup, render } from '@testing-library/react';
import { StrictMode, useState, type FormEvent, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MosparoField, type MosparoFieldProps } from '../src';
import { clearMosparoEnv, resetPage } from './helpers';
import { installRealMosparo } from './real-widget';

// These tests run mosparo's own frontend script (see tests/fixtures) instead
// of a stand-in, against a fake mosparo server that accepts the form.

const config = {
  host: 'https://mosparo.test',
  uuid: 'project-uuid',
  publicKey: 'public-key',
};

let server: ReturnType<typeof installRealMosparo>;

beforeEach(() => {
  clearMosparoEnv();
  server = installRealMosparo();
});

afterEach(() => {
  cleanup();
  resetPage();
  vi.unstubAllGlobals();
});

/** Let the widget's pending requests finish and React re-render. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
  });
}

type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void;

function ContactForm({
  onSubmit,
  ...fieldProps
}: MosparoFieldProps & { onSubmit: SubmitHandler }) {
  return (
    <form onSubmit={onSubmit}>
      <input name="name" defaultValue="Ada" />
      <MosparoField {...config} {...fieldProps} />
      <button type="submit">Send</button>
    </form>
  );
}

/** Render a form and return what a visitor can do with it. */
async function renderForm(ui: (onSubmit: SubmitHandler) => ReactNode) {
  const submitted = vi.fn((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget));
  });
  const view = render(ui(submitted));
  await settle();

  const form = view.container.querySelector('form')!;
  return {
    ...view,
    submitted,
    async tickCheckbox() {
      const checkbox = form.querySelector<HTMLInputElement>(
        '.mosparo__container input[type="checkbox"]',
      )!;
      await act(async () => checkbox.click());
      await settle();
    },
    async pressSend() {
      await act(async () => form.querySelector('button')!.click());
      await settle();
    },
  };
}

describe('MosparoField with the real mosparo widget', () => {
  it('holds the submit back until mosparo has checked the form', async () => {
    const form = await renderForm((onSubmit) => <ContactForm onSubmit={onSubmit} />);

    await form.pressSend();
    expect(form.submitted).not.toHaveBeenCalled();

    await form.tickCheckbox();
    await form.pressSend();

    expect(form.submitted).toHaveBeenCalledOnce();
    expect(form.submitted).toHaveReturnedWith(
      expect.objectContaining({
        name: 'Ada',
        _mosparo_submitToken: 'submit-token',
        _mosparo_validationToken: 'validation-token',
      }),
    );
    expect(server.requests.map((request) => request.endpoint)).toEqual([
      '/api/v1/frontend/request-submit-token',
      '/api/v1/frontend/check-form-data',
    ]);
  });

  it('identifies the project to mosparo with the configured public key', async () => {
    await renderForm((onSubmit) => <ContactForm onSubmit={onSubmit} />);

    expect(server.requests[0].data.publicKey).toBe('public-key');
  });

  it('tells onCheckForm whether mosparo accepted the form', async () => {
    const onCheckForm = vi.fn();
    const form = await renderForm((onSubmit) => (
      <ContactForm onSubmit={onSubmit} callbacks={{ onCheckForm }} />
    ));

    await form.tickCheckbox();
    expect(onCheckForm).toHaveBeenLastCalledWith(true);

    server.checkFormDataResponse = { valid: false };
    await form.tickCheckbox();
    expect(onCheckForm).toHaveBeenLastCalledWith(false);
  });

  describe('when the widget is created more than once', () => {
    it('can still be submitted under StrictMode, which mounts the field twice', async () => {
      const form = await renderForm((onSubmit) => (
        <StrictMode>
          <ContactForm onSubmit={onSubmit} />
        </StrictMode>
      ));

      await form.tickCheckbox();
      await form.pressSend();

      expect(form.submitted).toHaveBeenCalledOnce();
    });

    it('can still be submitted after a re-render with a new options object', async () => {
      let rerenderParent!: () => void;
      function Page({ onSubmit }: { onSubmit: SubmitHandler }) {
        const [, setRenders] = useState(0);
        rerenderParent = () => setRenders((renders) => renders + 1);
        return <ContactForm onSubmit={onSubmit} options={{ language: 'cs' }} />;
      }

      const form = await renderForm((onSubmit) => <Page onSubmit={onSubmit} />);
      await act(async () => rerenderParent());
      await settle();

      await form.tickCheckbox();
      await form.pressSend();

      expect(form.submitted).toHaveBeenCalledOnce();
    });

    it('leaves only the honeypot field of the current widget in the form', async () => {
      server.submitTokenResponse = {
        submitToken: 'submit-token',
        honeypotFieldName: 'website',
      };

      const form = await renderForm((onSubmit) => (
        <StrictMode>
          <ContactForm onSubmit={onSubmit} />
        </StrictMode>
      ));

      expect(form.container.querySelectorAll('[name="website"]')).toHaveLength(1);
    });
  });
});
