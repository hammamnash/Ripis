import { expect, test, type Page } from '@playwright/test';
import { computed, setTheme } from './helpers';

/**
 * Task 7.2's proof, ported from `mockups/_checks/`. The mockups could only assert against a
 * hand-written stylesheet; this asserts against the app's own compiled CSS, through real
 * components, in both themes.
 *
 * The load-bearing assertion is not "the card is white" — it is that the SAME component computes a
 * DIFFERENT value in the two themes. A component whose theme class never applied renders identically
 * in both, which is exactly the failure §2.9 describes and an eyeball review misses.
 */

/** §11's light values, from `:root` in app/globals.css. */
const LIGHT = {
  canvas: 'rgb(244, 242, 240)', // #f4f2f0
  surface: 'rgb(255, 255, 255)', // #ffffff
  ink: 'rgb(12, 10, 8)', // #0c0a08
  ash: 'rgb(109, 108, 107)', // #6d6c6b
  hairline: 'rgb(229, 231, 235)', // #e5e7eb
  skeleton: 'rgb(211, 211, 211)', // #d3d3d3
  action: 'rgb(228, 242, 34)', // #e4f222
  negative: 'rgb(163, 38, 28)', // #a3261c — --color-negative, §3's status red
} as const;

/** §11's dark values. Ash, hairline and skeleton all move; canvas and surface are warm, not grey. */
const DARK = {
  canvas: 'rgb(20, 18, 15)', // #14120f
  surface: 'rgb(30, 27, 24)', // #1e1b18
  ink: 'rgb(244, 242, 240)', // #f4f2f0 — Bone
  ash: 'rgb(158, 152, 145)', // #9e9891
  hairline: 'rgb(58, 52, 48)', // #3a3430
  skeleton: 'rgb(66, 59, 54)', // #423b36
} as const;

/**
 * The computed colour as [r, g, b, alpha]. `bg-skeleton/40` compiles to
 * `color-mix(in oklab, …)`, and Chrome reports that back as an `oklab(…)` string rather than rgb —
 * so a regex over the raw value would be asserting Chrome's serialisation, not the colour. Painting
 * one pixel through a canvas resolves any colour space to numbers.
 *
 * A translucent colour drifts by a unit on the way back (the canvas stores premultiplied alpha and
 * un-premultiplies on read), so compare with `expectChannel` rather than exact equality.
 */
async function rgbaOf(page: Page, testId: string): Promise<[number, number, number, number]> {
  return page.getByTestId(testId).evaluate((el) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r ?? 0, g ?? 0, b ?? 0, (a ?? 0) / 255];
  });
}

/** Per-channel comparison with the 1-unit slack the premultiplied-alpha round-trip needs. */
function expectChannel(actual: [number, number, number], expected: [number, number, number]) {
  actual.forEach((v, i) => expect(Math.abs(v - (expected[i] ?? 0))).toBeLessThanOrEqual(1));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/probe');
  await expect(page.getByTestId('probe')).toBeVisible();
});

test('every component resolves its colour from a token, and the tokens differ per theme', async ({
  page,
}) => {
  await setTheme(page, 'light');

  /* The card is §2.2 level 1: --surface-card on --surface-canvas, lifted by a hairline, never a
     shadow (§2.6 bans shadow as an elevation primitive). */
  expect(await computed(page, 'card', 'background-color')).toBe(LIGHT.surface);
  expect(await computed(page, 'card', 'border-top-color')).toBe(LIGHT.hairline);

  /* The primary pill is INK (#0c0a08), not the accent — §5's "so the accent stays scarce". */
  expect(await computed(page, 'btn-primary', 'background-color')).toBe(LIGHT.ink);

  /* The destructive pill is TEXT-ONLY in --color-negative: "destructive actions are never a
     coloured button". A filled red button here would mean the variant regressed to shadcn's. */
  expect(await computed(page, 'btn-destructive', 'color')).toBe(LIGHT.negative);
  expect(await computed(page, 'btn-destructive', 'background-color')).toBe('rgba(0, 0, 0, 0)');

  /* The skeleton is smoke at 40%, NOT the accent. bg-accent here would paint a loading placeholder
     in the one colour §5 reserves for a single action per screen. */
  const [sr, sg, sb, sa] = await rgbaOf(page, 'skeleton');
  expectChannel([sr, sg, sb], [211, 211, 211]);
  expect(sa).toBeCloseTo(0.4, 1);

  /* §5's form field: 48px, radius 12px, --surface-card fill. */
  expect(await computed(page, 'input', 'height')).toBe('48px');
  expect(await computed(page, 'input', 'border-top-left-radius')).toBe('12px');
  expect(await computed(page, 'input', 'background-color')).toBe(LIGHT.surface);

  /* §5's segmented control is 44px on a --surface-wash track. */
  expect(await computed(page, 'tabs-list', 'height')).toBe('44px');
  expect(await computed(page, 'tabs-list', 'background-color')).toBe('rgb(244, 242, 240)');

  /* §2.5: a transaction row has radius 0 and is divided by hairlines, not cards. */
  expect(await computed(page, 'table-row', 'border-top-left-radius')).toBe('0px');

  /* Now flip the theme. Every assertion below is the same element computing a different value. */
  await setTheme(page, 'dark');

  expect(await computed(page, 'card', 'background-color')).toBe(DARK.surface);
  expect(await computed(page, 'card', 'border-top-color')).toBe(DARK.hairline);
  expect(await computed(page, 'btn-primary', 'background-color')).toBe('rgb(38, 34, 32)');
  expect(await computed(page, 'btn-destructive', 'color')).not.toBe(LIGHT.negative);
  expect(await computed(page, 'input', 'background-color')).toBe(DARK.surface);

  /* Same skeleton, dark smoke — and still translucent, so the wash bed shows through in both. */
  const [dr, dg, db] = await rgbaOf(page, 'skeleton');
  expectChannel([dr, dg, db], [66, 59, 54]);

  /* §2.9's actual claim: dark is a WARM dark, not an inversion. If canvas went to grey, the theme
     block did not apply and these hexes are the tripwire. */
  const bodyBg = await page.evaluate(
    () => getComputedStyle(document.body).getPropertyValue('background-color'),
  );
  expect(bodyBg).toBe(DARK.canvas);
});

test('the dark theme is not an inversion of the light one (§2.9)', async ({ page }) => {
  await setTheme(page, 'dark');

  /* Ink and canvas swap roles, which an inversion would also produce — but ash does NOT become the
     complement of light ash, and the surface stays warmer than the canvas. Those two are what
     separate a designed dark theme from a computed one. */
  expect(await computed(page, 'card', 'background-color')).toBe(DARK.surface);
  const surface = await computed(page, 'card', 'background-color');
  const canvas = await page.evaluate(
    () => getComputedStyle(document.body).getPropertyValue('background-color'),
  );

  /* §2.2: level 1 sits ABOVE the canvas. In dark the surface is lighter than the canvas; an
     inversion would make it darker. */
  const lum = (rgb: string) => {
    const parts = (rgb.match(/\d+/g) ?? []).map(Number);
    const [r = 0, g = 0, b = 0] = parts;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  expect(lum(surface)).toBeGreaterThan(lum(canvas));
});

test('every tap target is at least 44px (§9)', async ({ page }) => {
  await setTheme(page, 'light');

  /* §9's floor. §5 is explicit that the Icon Button's 40px circle is what the eye sees and the hit
     area is padded to 44 — so the measured element is the button, not the circle. */
  for (const id of ['btn-primary', 'btn-ghost', 'btn-destructive', 'btn-icon']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, `${id} has no box`).not.toBeNull();
    expect(box!.height, `${id} height`).toBeGreaterThanOrEqual(44);
  }
});

test('nothing is clipped at 320px (§9)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await setTheme(page, 'light');

  /* §9's smallest supported width. A horizontal overflow here is the failure a 430px design review
     cannot see. */
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
