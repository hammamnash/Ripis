import type { Page } from '@playwright/test';

/**
 * Shared measurement for the e2e suite.
 *
 * Task 7.2 wrote `setTheme` inside `theming.spec.ts`; Task 7.3 is the second spec to need it, and the
 * function is subtle enough that two copies would drift — the RAF-then-transitions wait is the part
 * that makes a theme assertion deterministic instead of flaky, and a copy that quietly dropped it
 * would still pass, just sometimes against an interpolated colour.
 */

/**
 * Flip the theme and wait for the cascade to SETTLE.
 *
 * One frame is not enough: components carry `transition-colors` (§2.7), so for the length of the
 * transition `getComputedStyle` reports an interpolated colour between the two themes. Reading then
 * produces a value that is neither theme's, which looks like a broken token but is just motion
 * mid-flight. Only CSS transitions are awaited — `animate-pulse` runs forever and `finished` never
 * resolves for it.
 */
export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(async (t) => {
    document.documentElement.setAttribute('data-theme', t);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const transitions = document
      .getAnimations()
      .filter((a) => a instanceof CSSTransition) as CSSTransition[];
    await Promise.all(transitions.map((a) => a.finished.catch(() => undefined)));
  }, theme);
}

/** One computed property off the element carrying `testId`. */
export async function computed(page: Page, testId: string, prop: string) {
  return page.getByTestId(testId).evaluate((el, p) => {
    return getComputedStyle(el).getPropertyValue(p as string);
  }, prop);
}

/**
 * Assert that an element's computed property IS the value of a design token, by resolving the token
 * into a throwaway probe inside the same page and comparing the two computed strings.
 *
 * Comparing against a hardcoded rgb() would pin the token's value twice — once here and once in
 * `app/__tests__/tokens.test.ts` — and the copy in the spec would be the one nobody remembers to
 * update. This asks the question §11 actually asks: does the component read the token, in whichever
 * theme is live?
 */
export async function cssValueOfToken(page: Page, token: string, prop: string): Promise<string> {
  return page.evaluate(
    ({ token, prop }) => {
      const probe = document.createElement('span');
      probe.style.setProperty(prop, `var(${token})`);
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    { token, prop },
  );
}
