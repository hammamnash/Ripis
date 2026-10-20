import { expect, test, type Page } from '@playwright/test';
import { computed, cssValueOfToken, setTheme } from './helpers';

/**
 * Task 7.3's proof: §6's frame, measured.
 *
 * The rest of 7.3 runs in `npm run gate` (the token scan reads every component, the month arithmetic
 * has a unit test), but four of §6's claims are only true or false in a laid-out browser: a thumb
 * target's size, an inset that resolves from `env()`, a sticky header's behaviour, and whether the
 * theme is on the document before the first paint. Those are here.
 *
 * What this file does NOT prove, so the next session does not assume it:
 *
 *   - the toast (§5) — nothing fires one yet. Its proof needs a screen that shows one, which is 7.4b.
 *   - scroll-under-sticky — every route here is shorter than the viewport (an empty state), so the
 *     header never has anything to slide under. `position: sticky` is asserted; the behaviour is not.
 *   - a non-zero safe-area inset — `env(safe-area-inset-bottom)` is 0 in a desktop Chrome window, so
 *     the rule is asserted as "the bar's height is built from the token plus that term", not by
 *     faking a device inset Chrome will not give us.
 */

/** The hook installed by the pre-paint test below. Declared here so the spec can read it typed. */
declare global {
  interface Window {
    __themeSet?: { readyState: string; value: string };
  }
}

const ROUTES = ['/', '/transactions', '/budgets', '/wallets', '/settings'] as const;

/** §9's supported widths: the smallest phone, a common one, and the 430px the design was drawn at. */
const WIDTHS = [320, 390, 430] as const;

async function gotoRoute(page: Page, route: string) {
  const response = await page.goto(route);
  expect(response?.status(), `${route} did not render`).toBe(200);
  await expect(page.getByTestId('tab-bar')).toBeVisible();
}

test('the shell frames every tab, and nothing scrolls sideways at any supported width', async ({
  page,
}) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });

    for (const route of ROUTES) {
      await gotoRoute(page, route);

      await expect(page.getByTestId('shell-header'), `${route} header`).toBeVisible();
      await expect(page.getByTestId('fab'), `${route} fab`).toBeVisible();

      /* §9's smallest supported width. A horizontal overflow at 320px is the failure a 430px design
         review cannot see — the tab bar's five labels are the thing most likely to cause it. */
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} at ${width}px overflows`).toBeLessThanOrEqual(1);
    }
  }
});

test('the bar is 64px of five thumb-sized targets, and marks exactly the open one (§6)', async ({
  page,
}) => {
  await gotoRoute(page, '/transactions');
  await setTheme(page, 'light');

  const bar = (await page.getByTestId('tab-bar').boundingBox())!;
  /* 64px on its own, plus the safe-area term which is 0 in this window. */
  expect(Math.round(bar.height)).toBe(64);
  expect(await computed(page, 'tab-bar', 'position')).toBe('fixed');

  for (const label of ['dashboard', 'transactions', 'budgets', 'wallets', 'settings']) {
    const box = (await page.getByTestId(`tab-${label}`).boundingBox())!;
    /* §9's floor applies to the whole item, not the 24px glyph inside it: the label under the icon is
       part of what the thumb aims at. */
    expect(box.height, `tab-${label} height`).toBeGreaterThanOrEqual(44);
    expect(box.width, `tab-${label} width`).toBeGreaterThanOrEqual(44);
  }

  /* One current, and it is the route we are on — not the first item, not all of them. */
  await expect(page.locator('[data-testid^="tab-"][aria-current="page"]')).toHaveCount(1);
  await expect(page.getByTestId('tab-transactions')).toHaveAttribute('aria-current', 'page');

  /* §6: the active item is ink, and the highlight is never --color-highlighter (§10 #3 names
     "highlighter on a tab bar" as the tell of the generic product). */
  expect(await computed(page, 'tab-transactions', 'color')).toBe(
    await cssValueOfToken(page, '--color-ink', 'color'),
  );
  expect(await computed(page, 'tab-dashboard', 'color')).toBe(
    await cssValueOfToken(page, '--color-ash', 'color'),
  );
  expect(await computed(page, 'tab-transactions', 'color')).not.toBe(
    await cssValueOfToken(page, '--color-highlighter', 'color'),
  );

  /* The bar is --surface-card over the canvas, divided by a hairline, never a shadow (§2.6). */
  expect(await computed(page, 'tab-bar', 'background-color')).toBe(
    await cssValueOfToken(page, '--surface-card', 'background-color'),
  );
  expect(await computed(page, 'tab-bar', 'border-top-color')).toBe(
    await cssValueOfToken(page, '--color-hairline', 'border-top-color'),
  );

  /* Same element, dark theme: the active/inactive split has to survive the flip, because ash and ink
     both move there and a hardcoded pair would collapse. */
  await setTheme(page, 'dark');
  expect(await computed(page, 'tab-transactions', 'color')).toBe(
    await cssValueOfToken(page, '--color-ink', 'color'),
  );
  expect(await computed(page, 'tab-bar', 'background-color')).toBe(
    await cssValueOfToken(page, '--surface-card', 'background-color'),
  );
});

test('the FAB floats 16px above the bar and 16px from the gutter (§6)', async ({ page }) => {
  await gotoRoute(page, '/transactions');
  await setTheme(page, 'light');

  const bar = (await page.getByTestId('tab-bar').boundingBox())!;
  const fab = (await page.getByTestId('fab').boundingBox())!;

  expect(Math.round(fab.width)).toBe(56);
  expect(Math.round(fab.height)).toBe(56);
  expect(fab.width).toBe(fab.height);

  /* Measured against the BAR, not the viewport bottom: that is the number §6 gives, and it is the one
     that stays true when the safe-area inset makes the bar taller. */
  expect(Math.round(bar.y - (fab.y + fab.height))).toBe(16);

  const viewport = page.viewportSize()!;
  expect(Math.round(viewport.width - (fab.x + fab.width))).toBe(16);

  /* §6 says "ink fill", and §5 explains why the token for that is --surface-primary: --color-ink is
     Bone in dark, so an ink-filled circle would carry a Paper glyph into a light-on-light washout. */
  expect(await computed(page, 'fab', 'background-color')).toBe(
    await cssValueOfToken(page, '--surface-primary', 'background-color'),
  );

  await setTheme(page, 'dark');
  expect(await computed(page, 'fab', 'background-color')).toBe(
    await cssValueOfToken(page, '--surface-primary', 'background-color'),
  );
  /* And it is still a dark circle in dark — the whole point of the swap. */
  expect(await computed(page, 'fab', 'background-color')).not.toBe(
    await cssValueOfToken(page, '--color-ink', 'background-color'),
  );
});

test('the header is sticky, on the canvas, and divided by a hairline (§6)', async ({ page }) => {
  await gotoRoute(page, '/transactions');
  await setTheme(page, 'light');

  expect(await computed(page, 'shell-header', 'position')).toBe('sticky');
  expect(await computed(page, 'shell-header', 'top')).toBe('0px');

  /* Canvas, not card: a white bar over a bone canvas reads as a second surface competing with the
     content, which is what §6's "dissolves into the page" is asking for. */
  expect(await computed(page, 'shell-header', 'background-color')).toBe(
    await cssValueOfToken(page, '--surface-canvas', 'background-color'),
  );
  expect(await computed(page, 'shell-header', 'border-bottom-color')).toBe(
    await cssValueOfToken(page, '--color-hairline', 'border-bottom-color'),
  );

  /* A top-level screen is serif at --text-heading; the nested variant is sans at --text-subheading
     (§6). The switch is asserted here through the one screen that has a top-level header. */
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText('Transactions');
  expect(await title.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Source Serif');
});

test.describe('the theme is decided before the first paint (§2.9)', () => {
  test.use({ colorScheme: 'dark' });

  test('writes data-theme while the document is still parsing, and the stored choice beats the OS', async ({
    page,
  }) => {
    /* Hook the DOM before any page script runs, so the moment the theme is written is observable. If
       the provider is ever moved behind hydration, `readyState` stops being "loading" and this fails —
       which is the regression that produces a light flash on a dark phone. */
    await page.addInitScript(() => {
      const original = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if (
          name === 'data-theme' &&
          this === document.documentElement &&
          window.__themeSet === undefined
        ) {
          window.__themeSet = { readyState: document.readyState, value: String(value) };
        }
        return original.call(this, name, value);
      };
    });

    await page.goto('/');
    await expect(page.getByTestId('tab-bar')).toBeVisible();

    const probe = await page.evaluate(() => window.__themeSet);
    expect(probe, 'nothing wrote data-theme').toBeDefined();
    /* §2.9: "before first paint". "loading" means the parser had not finished, so no content had
       been painted from an unstyled document. */
    expect(probe?.readyState).toBe('loading');
    expect(probe?.value).toBe('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    /* §2.9's other half: the OS is the default, not the authority. */
    await page.evaluate(() => localStorage.setItem('ripis-theme', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect((await page.evaluate(() => window.__themeSet))?.value).toBe('light');
  });
});

test('the month selector steps backwards across a year boundary (§5, ADR-0007)', async ({ page }) => {
  await gotoRoute(page, '/transactions?month=2026-01');
  await expect(page.getByTestId('month-label')).toHaveText('January 2026');

  /* A URL, not component state: the chevron is a link, so this is a real navigation and the month is
     still set after a reload. `Date` maths at a month boundary is the timezone bug ADR-0007 exists to
     avoid, so the assertion is on the calendar month that comes back. */
  await page.getByTestId('month-prev').click();
  await expect(page).toHaveURL(/month=2025-12$/);
  await expect(page.getByTestId('month-label')).toHaveText('December 2025');

  await page.getByTestId('month-next').click();
  await page.getByTestId('month-next').click();
  await expect(page).toHaveURL(/month=2026-02$/);
  await expect(page.getByTestId('month-label')).toHaveText('February 2026');
});

test('a chevron is a 44px target, and an unparseable month is not an error (§5, §9)', async ({
  page,
}) => {
  await gotoRoute(page, '/transactions?month=2026-01');

  for (const id of ['month-prev', 'month-next']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
  }

  /* A hand-edited query string is not a server error: it falls back to the current month and renders. */
  const response = await page.goto('/transactions?month=nonsense');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('month-label')).toHaveText(/^[A-Z][a-z]+ \d{4}$/);
});
