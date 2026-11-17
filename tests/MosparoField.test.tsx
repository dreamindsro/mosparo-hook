import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MosparoOptions } from '../src';
import {
  clearMosparoEnv,
  createMosparoMock,
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
let MosparoField: typeof import('../src').MosparoField;

beforeEach(async () => {
  clearMosparoEnv();
  vi.resetModules();
  ({ MosparoField } = await import('../src'));
});

afterEach(() => {
  cleanup();
  resetPage();
});

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
      { loadCssResource: true },
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

    const { container } = render(<MosparoField host={config.host} />);

    expect(container.innerHTML).toBe('');
    expect(mosparoScripts()).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Missing mosparo config'),
    );
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

    expect(widgetOptions(mosparo)).toEqual({
      loadCssResource: true,
      language: 'cs',
      designMode: true,
    });
  });

  it('lets options override the default', async () => {
    render(<MosparoField {...config} options={{ loadCssResource: false }} />);
    const mosparo = await loadWidgetScript();

    expect(widgetOptions(mosparo)).toEqual({ loadCssResource: false });
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

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('captcha');
    expect(wrapper.style.marginTop).toBe('8px');
    expect(wrapper.querySelector('#contact-captcha')).not.toBeNull();
    expect(mosparo.mock.calls[0][0]).toBe('contact-captcha');
  });

  it('keeps the widget when the parent re-renders with the same props', async () => {
    const options: MosparoOptions = { language: 'cs' };
    const { rerender } = render(<MosparoField {...config} options={options} />);
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} options={options} />);

    expect(mosparo).toHaveBeenCalledOnce();
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
  it('hands the callbacks to the widget and passes arguments and results through', async () => {
    const onBeforeGetFormData = vi.fn((formData: Record<string, unknown>) => ({
      ...formData,
      added: 'by callback',
    }));
    const onValidateFormInvisible = vi.fn(() => false);

    render(
      <MosparoField
        {...config}
        callbacks={{ onBeforeGetFormData }}
        invisibleCallbacks={{ onValidateFormInvisible }}
      />,
    );
    const options = widgetOptions(await loadWidgetScript());

    expect(options.onBeforeGetFormData({ name: 'Ada' })).toEqual({
      name: 'Ada',
      added: 'by callback',
    });
    expect(onBeforeGetFormData).toHaveBeenCalledExactlyOnceWith({ name: 'Ada' });
    expect(options.onValidateFormInvisible()).toBe(false);
  });

  it('only registers the callbacks it was given', async () => {
    render(<MosparoField {...config} callbacks={{ onCheckForm: () => {} }} />);
    const options = widgetOptions(await loadWidgetScript());

    expect(Object.keys(options).sort()).toEqual(['loadCssResource', 'onCheckForm']);
  });

  it('calls the latest callback after a re-render without recreating the widget', async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(
      <MosparoField {...config} callbacks={{ onCheckForm: first }} />,
    );
    const mosparo = await loadWidgetScript();

    rerender(<MosparoField {...config} callbacks={{ onCheckForm: second }} />);
    widgetOptions(mosparo).onCheckForm();

    expect(mosparo).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('MosparoField errors', () => {
  it('reports a widget that fails to initialise through onError', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('Project not found');
    const onError = vi.fn();

    render(<MosparoField {...config} onError={onError} />);
    await loadWidgetScript(
      vi.fn(function () {
        throw failure;
      }),
    );

    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  });
});
