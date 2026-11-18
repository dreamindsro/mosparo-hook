import { act, cleanup, render as renderAlone } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MosparoOptions, MosparoStatus } from '../src/react';
import {
  clearMosparoEnv,
  createMosparoMock,
  failScriptLoad,
  finishScriptLoad,
  mosparoScripts,
  resetPage,
  type MosparoMock,
} from './helpers';

const config = {
  host: 'https://mosparo.test',
  uuid: 'project-uuid',
  publicKey: 'public-key',
};

// A fresh copy of the library per test, so one test's loaded script does not
// count as loaded in the next.
let MosparoField: typeof import('../src/react').MosparoField;

beforeEach(async () => {
  clearMosparoEnv();
  vi.resetModules();
  ({ MosparoField } = await import('../src/react'));
});

afterEach(() => {
  cleanup();
  resetPage();
});

/** mosparo protects a form, so the field is rendered inside one. */
function render(ui: ReactElement) {
  return renderAlone(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <form>{children}</form>,
  });
}

/** Let the script tag the field added finish loading. */
async function loadWidgetScript(mosparo?: MosparoMock): Promise<MosparoMock> {
  let loaded!: MosparoMock;
  await act(async () => {
    loaded = finishScriptLoad(mosparoScripts()[0], mosparo);
  });
  return loaded;
}

/** The options object the widget was created with on its nth initialisation. */
function widgetOptions(mosparo: MosparoMock, call = 0) {
  return mosparo.mock.calls[call][4] as Record<
    string,
    (...args: unknown[]) => unknown
  >;
}

describe('MosparoField configuration', () => {
  it('takes host, uuid and public key from props', async () => {
    render(<MosparoField {...config} />);

    expect(mosparoScripts().map((script) => script.src)).toEqual([
      'https://mosparo.test/build/mosparo-frontend.js',
    ]);

    const mosparo = await loadWidgetScript();

    expect(mosparo).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^mosparo-/),
      'https://mosparo.test',
      'project-uuid',
      'public-key',
      expect.objectContaining({ loadCssResource: true }),
    );
  });

  it('falls back to the NEXT_PUBLIC_MOSPARO_* variables without props', async () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://env.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'env-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'env-key');

    render(<MosparoField />);
    const mosparo = await loadWidgetScript();

    expect(mosparo).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'https://env.test',
      'env-uuid',
      'env-key',
      expect.any(Object),
    );
  });

  it('lets each prop override its environment variable', async () => {
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_HOST', 'https://env.test');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_UUID', 'env-uuid');
    vi.stubEnv('NEXT_PUBLIC_MOSPARO_PUBLIC_KEY', 'env-key');

    render(<MosparoField uuid="other-project" />);
    const mosparo = await loadWidgetScript();

    expect(mosparo).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'https://env.test',
      'other-project',
      'env-key',
      expect.any(Object),
    );
  });

  it('renders nothing, loads nothing and says why when the configuration is incomplete', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const onStatusChange = vi.fn();

    const { container } = render(
      <MosparoField host={config.host} onStatusChange={onStatusChange} />,
    );

    expect(container.querySelector('form')!.innerHTML).toBe('');
    expect(mosparoScripts()).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Missing mosparo config'),
    );
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
  });
});

describe('MosparoField widget', () => {
  it('renders an empty container first and fills it once the script has loaded', async () => {
    render(<MosparoField {...config} id="captcha" />);

    const widgetContainer = document.getElementById('captcha')!;
    expect(widgetContainer.children).toHaveLength(0);

    await loadWidgetScript();

    expect(widgetContainer.querySelectorAll('.mosparo__container')).toHaveLength(1);
  });

  it('creates the widget without loading a script when mosparo is already on the page', () => {
    const mosparo = createMosparoMock();
    window.mosparo = mosparo as unknown as Window['mosparo'];

    render(<MosparoField {...config} />);

    expect(mosparoScripts()).toHaveLength(0);
    expect(mosparo).toHaveBeenCalledOnce();
  });

  it('loads the script once for several fields and gives each its own container', async () => {
    render(
      <>
        <MosparoField {...config} />
        <MosparoField {...config} />
        <MosparoField {...config} />
      </>,
    );

    expect(mosparoScripts()).toHaveLength(1);

    const mosparo = await loadWidgetScript();
    const containerIds = mosparo.mock.calls.map(([containerId]) => containerId);

    expect(new Set(containerIds).size).toBe(3);
    for (const containerId of containerIds) {
      const widgetContainer = document.getElementById(containerId)!;
      expect(widgetContainer.querySelectorAll('.mosparo__container')).toHaveLength(1);
      // mosparo uses the id in CSS selectors, so it has to be valid in one.
      expect(document.querySelector(`#${containerId}`)).toBe(widgetContainer);
    }
  });

  it('passes widget options on, on top of its own default', async () => {
    render(
      <MosparoField {...config} options={{ language: 'cs', designMode: true }} />,
    );
    const mosparo = await loadWidgetScript();

    expect(widgetOptions(mosparo)).toMatchObject({
      loadCssResource: true,
      language: 'cs',
      designMode: true,
    });
  });

  it('lets options override the default', async () => {
    render(<MosparoField {...config} options={{ loadCssResource: false }} />);
    const mosparo = await loadWidgetScript();

    expect(widgetOptions(mosparo)).toMatchObject({ loadCssResource: false });
  });

  it('applies id, className and style', async () => {
    const { container } = render(
      <MosparoField
        {...config}
        id="contact-captcha"
        className="captcha"
        style={{ marginTop: 8 }}
      />,
    );
    const mosparo = await loadWidgetScript();

    const wrapper = container.querySelector('form')!.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('captcha');
    expect(wrapper.style.marginTop).toBe('8px');
    expect(wrapper.querySelector('#contact-captcha')).not.toBeNull();
    expect(mosparo.mock.calls[0][0]).toBe('contact-captcha');
  });

  it('keeps the widget when the parent re-renders with an equal options object', async () => {
    // Options are usually written inline, which makes a new object per render.
    const { rerender } = render(
      <MosparoField {...config} options={{ language: 'cs' }} />,
    );
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} options={{ language: 'cs' }} />);

    expect(mosparo).toHaveBeenCalledOnce();
  });

  it('replaces the widget when an option changes', async () => {
    const options: MosparoOptions = { language: 'cs' };
    const { rerender } = render(<MosparoField {...config} options={options} />);
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} options={{ language: 'de' }} />);

    expect(mosparo).toHaveBeenCalledTimes(2);
    expect(widgetOptions(mosparo, 1)).toMatchObject({ language: 'de' });
  });

  it('puts the nonce on the script tag it adds', () => {
    render(<MosparoField {...config} nonce="r4nd0m" />);

    expect(mosparoScripts()[0].nonce).toBe('r4nd0m');
  });

  it('replaces the widget when the project changes', async () => {
    const { rerender } = render(<MosparoField {...config} id="captcha" />);
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} uuid="other-project" id="captcha" />);

    expect(mosparo).toHaveBeenCalledTimes(2);
    expect(mosparo.mock.calls[1][2]).toBe('other-project');
    expect(
      document.getElementById('captcha')!.querySelectorAll('.mosparo__container'),
    ).toHaveLength(1);
  });
});

describe('MosparoField callbacks', () => {
  it('hands the callbacks to the widget with the arguments mosparo passes', async () => {
    const form = document.createElement('form');
    const field = document.createElement('input');
    const formData = { fields: [], ignoredFields: [] };
    const extended = { fields: [], ignoredFields: ['extra'] };

    const onBeforeGetFormData = vi.fn();
    const onGetFormData = vi.fn(() => extended);
    const onGetFieldValue = vi.fn((_field: HTMLElement, value: unknown) =>
      String(value).trim(),
    );
    const onCheckForm = vi.fn();

    render(
      <MosparoField
        {...config}
        callbacks={{ onBeforeGetFormData, onGetFormData, onGetFieldValue, onCheckForm }}
      />,
    );
    const options = widgetOptions(await loadWidgetScript());

    options.onBeforeGetFormData(form);
    expect(onBeforeGetFormData).toHaveBeenCalledExactlyOnceWith(form);

    expect(options.onGetFormData(form, formData)).toBe(extended);
    expect(onGetFormData).toHaveBeenCalledExactlyOnceWith(form, formData);

    expect(options.onGetFieldValue(field, ' Ada ')).toBe('Ada');

    options.onCheckForm(true);
    expect(onCheckForm).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('leaves form data and field values as they are without callbacks', async () => {
    // mosparo uses what these two callbacks return, so a field without them
    // has to return what it was given.
    const formData = { fields: [], ignoredFields: [] };

    render(<MosparoField {...config} />);
    const options = widgetOptions(await loadWidgetScript());

    expect(options.onGetFormData(document.createElement('form'), formData)).toBe(
      formData,
    );
    expect(options.onGetFieldValue(document.createElement('input'), 'Ada')).toBe(
      'Ada',
    );
  });

  it('only takes over the multi-step flow when asked to', async () => {
    // mosparo skips its own next step as soon as one of these exists.
    render(<MosparoField {...config} />);
    const without = widgetOptions(await loadWidgetScript());

    expect(without).not.toHaveProperty('onFormDataStored');
    expect(without).not.toHaveProperty('onFormDataValid');
  });

  it('passes the multi-step callbacks on when they are given', async () => {
    const onFormDataStored = vi.fn();

    render(<MosparoField {...config} callbacks={{ onFormDataStored }} />);
    const options = widgetOptions(await loadWidgetScript());
    options.onFormDataStored();

    expect(onFormDataStored).toHaveBeenCalledOnce();
    expect(options).not.toHaveProperty('onFormDataValid');
  });

  it('calls the latest callback after a re-render without recreating the widget', async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(
      <MosparoField {...config} callbacks={{ onCheckForm: first }} />,
    );
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} callbacks={{ onCheckForm: second }} />);
    widgetOptions(mosparo).onCheckForm(true);

    expect(mosparo).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('calls a callback that was only added after the widget was created', async () => {
    const onResetState = vi.fn();

    const { rerender } = render(<MosparoField {...config} />);
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} callbacks={{ onResetState }} />);
    widgetOptions(mosparo).onResetState();

    expect(onResetState).toHaveBeenCalledOnce();
  });
});

describe('MosparoField errors', () => {
  /** Render a field and collect what it reports. */
  function renderReporting(ui: (props: {
    onError: (error: Error) => void;
    onStatusChange: (status: MosparoStatus) => void;
  }) => ReactElement, inForm = true) {
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    (inForm ? render : renderAlone)(ui({ onError, onStatusChange }));
    return { onError, onStatusChange };
  }

  it('reports a widget that fails to initialise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('Project not found');

    const { onError, onStatusChange } = renderReporting((report) => (
      <MosparoField {...config} {...report} />
    ));
    await loadWidgetScript(
      vi.fn(function () {
        throw failure;
      }),
    );

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
  });

  it('reports a script that cannot be loaded', async () => {
    const { onError, onStatusChange } = renderReporting((report) => (
      <MosparoField {...config} {...report} />
    ));

    await act(async () => failScriptLoad(mosparoScripts()[0]));

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error(
        'Failed to load mosparo script from https://mosparo.test/build/mosparo-frontend.js',
      ),
    );
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
  });

  it('reports a field that is not inside a form', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { onError, onStatusChange } = renderReporting(
      (report) => <MosparoField {...config} {...report} />,
      false,
    );
    const mosparo = await loadWidgetScript();

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      new Error('The mosparo widget has to be inside the <form> it protects.'),
    );
    expect(onStatusChange).toHaveBeenLastCalledWith('error');
    expect(mosparo).not.toHaveBeenCalled();
  });
});
