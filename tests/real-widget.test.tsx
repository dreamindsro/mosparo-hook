import { act, cleanup, render } from '@testing-library/react';
import {
  StrictMode,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MosparoField,
  useMosparo,
  type MosparoFieldProps,
  type MosparoStatus,
  type UseMosparoResult,
} from '../src/react';
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
}: ComponentProps<typeof MosparoField> & { onSubmit: SubmitHandler }) {
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

  describe('useMosparo', () => {
    let mosparo!: UseMosparoResult;
    let statuses: MosparoStatus[];

    /** A form whose component follows the field with the hook. */
    function HookForm({
      onSubmit,
      ...fieldProps
    }: MosparoFieldProps & { onSubmit: SubmitHandler }) {
      mosparo = useMosparo();
      if (statuses[statuses.length - 1] !== mosparo.status) statuses.push(mosparo.status);
      return <ContactForm onSubmit={onSubmit} {...fieldProps} {...mosparo.field} />;
    }

    beforeEach(() => {
      statuses = [];
    });

    it('follows the widget from loading to verified', async () => {
      const form = await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);
      expect(statuses).toEqual(['loading', 'ready']);
      expect(mosparo.isVerified).toBe(false);

      await form.tickCheckbox();

      expect(statuses).toEqual(['loading', 'ready', 'checking', 'verified']);
      expect(mosparo.isVerified).toBe(true);
    });

    it('is "invalid" when mosparo rejects the form', async () => {
      server.checkFormDataResponse = { valid: false };
      const form = await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);

      await form.tickCheckbox();

      expect(mosparo.status).toBe('invalid');
    });

    it('is "error" when mosparo gives the widget no submit token', async () => {
      // What a wrong public key or a host that is not allowed leads to.
      server.submitTokenResponse = { error: true, errorMessage: 'No project available.' };

      await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);

      expect(mosparo.status).toBe('error');
    });

    it('is "error" when mosparo cannot be reached', async () => {
      server.down = true;

      await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);

      expect(mosparo.status).toBe('error');
    });

    it('goes back to "ready" when the visitor changes a checked field', async () => {
      const form = await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);
      await form.tickCheckbox();

      await act(async () => {
        const name = form.container.querySelector<HTMLInputElement>('[name="name"]')!;
        name.value = 'Grace';
        name.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await settle();

      expect(mosparo.status).toBe('ready');
    });

    it('gives the tokens of a checked form, and none before', async () => {
      const form = await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);
      expect(mosparo.getTokens()).toBeNull();

      await form.tickCheckbox();

      expect(mosparo.getTokens()).toEqual({
        submitToken: 'submit-token',
        validationToken: 'validation-token',
      });
    });

    it('checks the form on check(), without the visitor ticking the box', async () => {
      await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);

      await act(async () => mosparo.check());
      await settle();

      expect(mosparo.status).toBe('verified');
    });

    it('starts over with a new submit token on reset()', async () => {
      // mosparo accepts a token once, so a form that stays on the page after
      // a submit needs a new one.
      const form = await renderForm((onSubmit) => <HookForm onSubmit={onSubmit} />);
      await form.tickCheckbox();
      await form.pressSend();

      server.submitTokenResponse = { submitToken: 'second-submit-token' };
      server.checkFormDataResponse = {
        valid: true,
        validationToken: 'second-validation-token',
      };
      await act(async () => mosparo.reset());
      await settle();

      expect(mosparo.status).toBe('ready');
      expect(mosparo.getTokens()).toBeNull();

      await form.tickCheckbox();
      await form.pressSend();

      expect(form.submitted).toHaveBeenCalledTimes(2);
      expect(form.submitted).toHaveLastReturnedWith(
        expect.objectContaining({
          _mosparo_submitToken: 'second-submit-token',
          _mosparo_validationToken: 'second-validation-token',
        }),
      );
    });

    it('works through a ref as well', async () => {
      let field!: { getTokens(): unknown } | null;
      const form = await renderForm((onSubmit) => (
        <ContactForm onSubmit={onSubmit} ref={(handle) => void (field = handle)} />
      ));

      await form.tickCheckbox();

      expect(field!.getTokens()).toEqual({
        submitToken: 'submit-token',
        validationToken: 'validation-token',
      });
    });
  });

  describe('in invisible mode', () => {
    beforeEach(() => {
      server.submitTokenResponse = { submitToken: 'submit-token', invisible: true };
    });

    it('checks the form on submit and then submits it', async () => {
      const form = await renderForm((onSubmit) => <ContactForm onSubmit={onSubmit} />);

      await form.pressSend();

      expect(form.submitted).toHaveBeenCalledOnce();
      expect(form.submitted).toHaveReturnedWith(
        expect.objectContaining({
          name: 'Ada',
          _mosparo_submitToken: 'submit-token',
          _mosparo_validationToken: 'validation-token',
        }),
      );
    });

    it('does not submit a form mosparo rejects', async () => {
      server.checkFormDataResponse = { valid: false };
      const form = await renderForm((onSubmit) => <ContactForm onSubmit={onSubmit} />);

      await form.pressSend();

      expect(form.submitted).not.toHaveBeenCalled();
    });

    it('submits the checked form even when its button was disabled meanwhile', async () => {
      // A button that disables itself on click is common. mosparo would click
      // it again after the check, which does nothing on a disabled button.
      function Form({ onSubmit }: { onSubmit: SubmitHandler }) {
        const [sending, setSending] = useState(false);
        return (
          <form onSubmit={onSubmit}>
            <input name="name" defaultValue="Ada" />
            <MosparoField {...config} />
            <button type="submit" disabled={sending} onClick={() => setSending(true)}>
              Send
            </button>
          </form>
        );
      }
      const form = await renderForm((onSubmit) => <Form onSubmit={onSubmit} />);

      await form.pressSend();

      expect(form.submitted).toHaveBeenCalledOnce();
    });

    it('leaves the submit to doSubmitFormInvisible when that is given', async () => {
      const doSubmitFormInvisible = vi.fn();
      const form = await renderForm((onSubmit) => (
        <ContactForm
          onSubmit={onSubmit}
          invisibleCallbacks={{ doSubmitFormInvisible }}
        />
      ));

      await form.pressSend();

      expect(doSubmitFormInvisible).toHaveBeenCalledOnce();
      expect(form.submitted).not.toHaveBeenCalled();
    });
  });
});
