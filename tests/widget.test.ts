import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMosparoWidget, type MosparoWidget } from '../src/core';
import type { MosparoStatus } from '../src/types';
import { resetPage } from './helpers';
import { installRealMosparo } from './real-widget';

// The framework-independent widget, with mosparo's own frontend script and no
// React around it.

const config = {
  host: 'https://mosparo.test',
  uuid: 'project-uuid',
  publicKey: 'public-key',
};

let server: ReturnType<typeof installRealMosparo>;

beforeEach(() => {
  server = installRealMosparo();
});

afterEach(() => {
  resetPage();
  vi.unstubAllGlobals();
});

/** Let pending requests and the status updates that follow them finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** A plain page with a form and a place for the widget. */
function page() {
  document.body.innerHTML = `
    <form>
      <input name="name" value="Ada">
      <div class="captcha"></div>
      <button type="submit">Send</button>
    </form>`;
  const form = document.querySelector('form')!;
  const submitted = vi.fn((event: Event) => event.preventDefault());
  form.addEventListener('submit', submitted);
  return {
    form,
    container: form.querySelector<HTMLElement>('.captcha')!,
    submitted,
    tickCheckbox: () =>
      form
        .querySelector<HTMLInputElement>('.mosparo__container input[type="checkbox"]')!
        .click(),
    pressSend: () => form.querySelector('button')!.click(),
  };
}

function follow(widget: MosparoWidget) {
  const statuses: MosparoStatus[] = [widget.getStatus()];
  const stop = widget.subscribe((status) => statuses.push(status));
  return { statuses, stop };
}

describe('createMosparoWidget', () => {
  it('needs the mosparo script', () => {
    const { container } = page();
    delete (window as Partial<Window>).mosparo;

    expect(() => createMosparoWidget(container, config)).toThrow(
      'The mosparo script is not loaded',
    );
  });

  it('needs a form around its container', () => {
    document.body.innerHTML = '<div class="captcha"></div>';
    const container = document.querySelector<HTMLElement>('.captcha')!;

    expect(() => createMosparoWidget(container, config)).toThrow(
      'has to be inside the <form>',
    );
  });

  it('gives a container without an id one, and keeps an existing id', () => {
    const first = page();
    createMosparoWidget(first.container, config);
    expect(first.container.id).toMatch(/^mosparo-\d+$/);

    const second = page();
    second.container.id = 'captcha';
    createMosparoWidget(second.container, config);
    expect(second.container.id).toBe('captcha');
  });

  it('reports every status the widget goes through', async () => {
    const { container, tickCheckbox } = page();
    const { statuses } = follow(createMosparoWidget(container, config));
    await settle();

    tickCheckbox();
    await settle();
    await settle();

    expect(statuses).toEqual(['loading', 'ready', 'checking', 'verified']);
  });

  it('stops reporting to a listener that unsubscribed', async () => {
    const { container, tickCheckbox } = page();
    const { statuses, stop } = follow(createMosparoWidget(container, config));
    await settle();

    stop();
    tickCheckbox();
    await settle();
    await settle();

    expect(statuses).toEqual(['loading', 'ready']);
  });

  it('adds only one loader in invisible mode, however often it starts over', async () => {
    server.submitTokenResponse = { submitToken: 'submit-token', invisible: true };
    const { container } = page();
    const widget = createMosparoWidget(container, config);
    await settle();

    widget.reset();
    await settle();
    widget.reset();
    await settle();

    expect(container.querySelectorAll('.mosparo__loader-container')).toHaveLength(1);
  });

  describe('destroy()', () => {
    it('lets the form be submitted again without a check', async () => {
      const { container, submitted, pressSend } = page();
      const widget = createMosparoWidget(container, config);
      await settle();

      pressSend();
      expect(submitted).not.toHaveBeenCalled();

      widget.destroy();
      pressSend();
      expect(submitted).toHaveBeenCalledOnce();
    });

    it('empties the container and leaves its own classes alone', async () => {
      const { container } = page();
      const widget = createMosparoWidget(container, config);
      await settle();
      expect(container.children.length).toBeGreaterThan(0);

      widget.destroy();

      expect(container.children).toHaveLength(0);
      expect(container.className).toBe('captcha');
    });

    it('turns reset(), check() and getTokens() into no-ops', async () => {
      const { container, tickCheckbox } = page();
      const widget = createMosparoWidget(container, config);
      await settle();
      tickCheckbox();
      await settle();
      const requests = server.requests.length;

      widget.destroy();
      widget.reset();
      widget.check();
      await settle();

      expect(widget.getTokens()).toBeNull();
      expect(server.requests).toHaveLength(requests);
    });
  });
});
