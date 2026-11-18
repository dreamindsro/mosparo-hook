import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const MOSPARO_URL = 'http://127.0.0.1:4310';

const forms = [
  { name: 'sent with fetch to a route handler', path: '/' },
  { name: 'sent to a server action', path: '/server-action' },
];

test.beforeEach(async ({ request }) => {
  await request.post(`${MOSPARO_URL}/__control/reset`);
});

/** Change how the stand-in mosparo server behaves. */
async function configureMosparo(
  request: APIRequestContext,
  settings: Record<string, unknown>,
) {
  await request.post(`${MOSPARO_URL}/__control`, { data: settings });
}

/** How many submissions the app's server had mosparo verify. */
async function verifications(request: APIRequestContext): Promise<number> {
  const control = await (await request.get(`${MOSPARO_URL}/__control`)).json();
  return control.requests.filter(
    (entry: { endpoint: string }) =>
      entry.endpoint === '/api/v1/verification/verify',
  ).length;
}

const mosparoStatus = (page: Page) => page.getByTestId('mosparo-status');

/** What the app tells the visitor after a submit. */
const formResult = (page: Page) => page.getByTestId('form-result');

async function fillIn(page: Page, name: string, message = 'Hello there') {
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(`${name.toLowerCase()}@example.com`);
  await page.getByLabel('Message').fill(message);
}

async function tickMosparoBox(page: Page) {
  await page.locator('.mosparo__container input[type="checkbox"]').click();
  await expect(mosparoStatus(page)).toHaveText('verified');
}

const send = (page: Page) => page.getByRole('button', { name: 'Send' }).click();

for (const form of forms) {
  test.describe(`a form ${form.name}`, () => {
    test('is sent once mosparo has checked it', async ({ page, request }) => {
      await page.goto(form.path);
      await expect(mosparoStatus(page)).toHaveText('ready');

      await fillIn(page, 'Ada');
      await tickMosparoBox(page);
      await send(page);

      await expect(formResult(page)).toHaveText('Thank you, Ada!');
      expect(await verifications(request)).toBe(1);
    });

    test('can be sent a second time without reloading the page', async ({
      page,
      request,
    }) => {
      // mosparo accepts its tokens once, so the widget has to fetch new ones.
      await page.goto(form.path);
      await fillIn(page, 'Ada');
      await tickMosparoBox(page);
      await send(page);
      await expect(formResult(page)).toHaveText('Thank you, Ada!');
      await expect(mosparoStatus(page)).toHaveText('ready');

      await fillIn(page, 'Grace');
      await tickMosparoBox(page);
      await send(page);

      await expect(formResult(page)).toHaveText('Thank you, Grace!');
      expect(await verifications(request)).toBe(2);
    });

    test('is not sent while mosparo has not checked it', async ({ page, request }) => {
      await page.goto(form.path);
      await expect(mosparoStatus(page)).toHaveText('ready');

      await fillIn(page, 'Ada');
      await send(page);

      await page.waitForTimeout(500);
      await expect(formResult(page)).toHaveCount(0);
      expect(await verifications(request)).toBe(0);
    });

    test('is not sent when mosparo finds spam in it', async ({ page, request }) => {
      await page.goto(form.path);
      await fillIn(page, 'Ada', 'buy cheap pills');
      await page.locator('.mosparo__container input[type="checkbox"]').click();

      await expect(mosparoStatus(page)).toHaveText('invalid');
      await expect(page.locator('.mosparo__error-message')).toBeVisible();

      await send(page);
      await page.waitForTimeout(500);
      expect(await verifications(request)).toBe(0);
    });

    test('can be sent again after the server turned it down', async ({
      page,
      request,
    }) => {
      await configureMosparo(request, { failVerification: true });
      await page.goto(form.path);
      await fillIn(page, 'Ada');
      await tickMosparoBox(page);
      await send(page);
      await expect(formResult(page)).toHaveText(
        'The spam protection did not accept the form. Please try again.',
      );

      await configureMosparo(request, { failVerification: false });
      await expect(mosparoStatus(page)).toHaveText('ready');
      await fillIn(page, 'Ada');
      await tickMosparoBox(page);
      await send(page);

      await expect(formResult(page)).toHaveText('Thank you, Ada!');
    });

    test('is checked and sent in one go in invisible mode', async ({
      page,
      request,
    }) => {
      await configureMosparo(request, { invisible: true });
      await page.goto(form.path);
      await expect(mosparoStatus(page)).toHaveText('ready');
      await expect(page.locator('.mosparo__container .mosparo__row')).toBeHidden();

      await fillIn(page, 'Ada');
      await send(page);

      await expect(formResult(page)).toHaveText('Thank you, Ada!');
      expect(await verifications(request)).toBe(1);
    });
  });
}

test('tells the visitor when mosparo cannot be reached by the server', async ({
  page,
  request,
}) => {
  // The app waits ten seconds for mosparo by default; this answer takes longer.
  test.slow();
  await configureMosparo(request, { verifyDelayMs: 11_000 });
  await page.goto('/');
  await fillIn(page, 'Ada');
  await tickMosparoBox(page);
  await send(page);

  await expect(formResult(page)).toHaveText(
    'The spam protection is not available right now. Please try again later.',
    { timeout: 20_000 },
  );
});
