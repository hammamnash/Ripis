import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* Task 0.6 — the token file is the design contract (.ai/03-design.md §11). These assertions are
   the machine-checkable part of it. Mechanics: everything below reads globals.css as text, with
   comments stripped first — the file's own prose quotes selectors and `prefers-color-scheme`, and
   an assertion that can be satisfied by a comment is worse than no assertion.

   Scope note on §11's "a name that resolves in one theme and not the other is a bug": that rule is
   about the COLOUR-ROLE families (--color-*, --wash-*, --surface-*). Geometry, type, motion and
   control tokens (--spacing-4, --duration-fast, --control-height, --tabbar-height, …) are
   theme-independent by construction and deliberately absent from the dark block, so asserting
   "resolves in both" over every name would fail on dozens of tokens that are correct as written. */

const CSS_PATH = new URL("../globals.css", import.meta.url);
const LAYOUT_PATH = new URL("../layout.tsx", import.meta.url);
const PAGE_PATH = new URL("../page.tsx", import.meta.url);

/* Strip comments from ALL three sources before asserting. The CSS prose quotes `prefers-color-scheme`
   and a selector; page.tsx's own prose names the banned weight utility it deliberately avoids. An
   assertion that a comment can satisfy — or trip — is not testing the code. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const css = stripComments(readFileSync(CSS_PATH, "utf8"));
const layout = stripComments(readFileSync(LAYOUT_PATH, "utf8"));
const page = stripComments(readFileSync(PAGE_PATH, "utf8"));

/** Raw text of every block whose selector contains `selector`, braces balanced. */
function blocks(selector: string): string[] {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    const open = css.indexOf("{", at);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth += 1;
      else if (css[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(css.slice(open + 1, end));
    from = end + 1;
  }
  return found;
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name && value) out[name] = value.trim();
  }
  return out;
}

const rootBlocks = blocks(":root");
const lightBlock = rootBlocks[0] ?? "";
const shadcnBlock = rootBlocks.find((b) => b.includes("--background")) ?? "";
const darkBlock = blocks(':root[data-theme="dark"]')[0] ?? "";
const themeBlocks = blocks("@theme");
const themeInlineBlock = themeBlocks.find((b) => b.includes("--color-background")) ?? "";
const themeMirrorBlocks = themeBlocks.filter((b) => b !== themeInlineBlock);

const light = declarations(lightBlock); // :root — authoritative for components
const dark = declarations(darkBlock);
const themeMirror = Object.assign({}, ...themeMirrorBlocks.map(declarations));
const themeInline = declarations(themeInlineBlock);
const shadcn = declarations(shadcnBlock);

/** §11 resolves a token here if it is declared in :root OR in the @theme mirror. */
const resolvesInLight = { ...themeMirror, ...light };

const COLOUR_ROLE = /^--(color|wash|surface)-/;
/* §2.9 re-derives the semantic layer per theme, but never these four: they are literal materials
   (paper stays paper, obsidian stays obsidian). Everything above them is what flips. */
const THEME_FIXED_SWATCHES = ["--color-obsidian", "--color-paper", "--color-bone", "--color-brick"];

describe("structure", () => {
  it("has all three §11 blocks plus the shadcn mapping", () => {
    expect(rootBlocks.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(light).length).toBeGreaterThan(80);
    expect(darkBlock).not.toBe("");
    expect(themeMirrorBlocks.length).toBeGreaterThanOrEqual(1);
    expect(shadcnBlock).not.toBe("");
    expect(themeInlineBlock).not.toBe("");
  });
});

describe("theme parity (§11: the same names must resolve in both themes)", () => {
  it("declares every colour-role token for the dark theme", () => {
    const missing = Object.keys(resolvesInLight)
      .filter((name) => COLOUR_ROLE.test(name))
      .filter((name) => !(name in dark))
      .filter((name) => !THEME_FIXED_SWATCHES.includes(name));
    expect(missing).toEqual([]);
  });

  it("introduces no dark-only colour-role token", () => {
    const darkOnly = Object.keys(dark)
      .filter((name) => COLOUR_ROLE.test(name))
      .filter((name) => !(name in resolvesInLight));
    expect(darkOnly).toEqual([]);
  });

  it("keeps the four literal swatches identical in both themes", () => {
    for (const name of THEME_FIXED_SWATCHES) {
      expect(light[name]).toBeDefined();
      expect(dark[name] ?? light[name]).toBe(light[name]);
    }
  });
});

describe("@theme mirrors the light values (§11 step 6 of the task)", () => {
  it("carries the identical value for every shared colour token", () => {
    const shared = Object.keys(themeMirror).filter((name) => name in light);
    const drifted = shared
      .filter((name) => COLOUR_ROLE.test(name) || name.startsWith("--wash-"))
      .filter((name) => themeMirror[name] !== light[name])
      .map((name) => `${name}: @theme ${themeMirror[name]} vs :root ${light[name]}`);
    expect(drifted).toEqual([]);
  });

  it("carries the identical value for every other shared token except the font families", () => {
    const shared = Object.keys(themeMirror).filter((name) => name in light);
    const drifted = shared
      .filter((name) => !name.startsWith("--font-"))
      .filter((name) => themeMirror[name] !== light[name])
      .map((name) => `${name}: @theme ${themeMirror[name]} vs :root ${light[name]}`);
    expect(drifted).toEqual([]);
  });
});

describe("themes are selected by attribute, never by media query (§2.9 / §11 note)", () => {
  it("defines the dark variant against [data-theme=\"dark\"]", () => {
    expect(css).toContain("@custom-variant");
    expect(css).toContain('[data-theme="dark"]');
  });

  it("never drives the theme from prefers-color-scheme", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("tells the browser which colour scheme to use for native UI", () => {
    expect(lightBlock).toMatch(/color-scheme:\s*light/);
    expect(darkBlock).toMatch(/color-scheme:\s*dark/);
  });
});

describe("every var() reference resolves", () => {
  const allDeclared = new Set([
    ...Object.keys(light),
    ...Object.keys(dark),
    ...Object.keys(themeMirror),
    ...Object.keys(themeInline),
    ...Object.keys(shadcn),
  ]);
  /* Supplied at runtime by next/font in layout.tsx, not declared in CSS. */
  const FROM_NEXT_FONT = new Set(["--font-inter", "--font-source-serif"]);

  it("points at a declared token, not at a name nothing defines", () => {
    const refs: string[] = [];
    for (const [, name] of css.matchAll(/var\((--[A-Za-z0-9-]+)/g)) {
      if (name) refs.push(name);
    }
    const unresolved = [...new Set(refs)].filter((n) => !allDeclared.has(n) && !FROM_NEXT_FONT.has(n));
    expect(unresolved).toEqual([]);
  });
});

describe("fonts (§2.3: both load through next/font)", () => {
  it("routes --font-sans and --font-serif through the next/font variables", () => {
    expect(light["--font-sans"]).toContain("var(--font-inter");
    expect(light["--font-serif"]).toContain("var(--font-source-serif");
  });

  it("keeps a literal family name as the fallback inside the var()", () => {
    expect(light["--font-sans"]).toContain("'Inter'");
    expect(light["--font-serif"]).toContain("'Source Serif 4'");
  });

  it("matches the variable names layout.tsx actually defines", () => {
    expect(layout).toContain('variable: "--font-inter"');
    expect(layout).toContain('variable: "--font-source-serif"');
  });
});

describe("weight ceiling (§2.3: never 600 or 700)", () => {
  it("declares no font weight above 500", () => {
    const weights = Object.entries({ ...light, ...themeMirror })
      .filter(([name]) => name.startsWith("--font-weight-"))
      .map(([name, value]) => `${name}: ${value}`);
    const over = weights.filter((entry) => Number(entry.split(":")[1]) > 500);
    expect(over).toEqual([]);
    expect(weights.length).toBeGreaterThan(0);
  });

  it("uses no banned weight utility in the shell", () => {
    const banned = /\b(font-(semibold|bold|extrabold|black))\b/g;
    expect([...`${page}${layout}`.matchAll(banned)].map((m) => m[0])).toEqual([]);
  });
});

describe("money typography (§2.3: tabular figures are mandatory)", () => {
  it("sets tabular numerals on the amount classes", () => {
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(css).toMatch(/\.amount/);
  });
});

describe("shadcn/ui is themed, not defaulted (ADR-0006)", () => {
  it("points every shadcn variable at one of our tokens", () => {
    const literal = Object.entries(shadcn)
      .filter(([, value]) => !value.includes("var(--"))
      .map(([name, value]) => `${name}: ${value}`);
    expect(literal).toEqual([]);
  });

  it("wires each variable into Tailwind so the utilities exist", () => {
    const wired = Object.keys(themeInline).filter((name) => name.startsWith("--color-"));
    const declared = wired.map((name) => name.replace("--color-", "--"));
    const dangling = declared.filter((name) => !(name in shadcn));
    expect(dangling).toEqual([]);
  });

  it("carries no shadcn radius of its own", () => {
    const values = Object.entries(shadcn).filter(([name]) => name.startsWith("--radius"));
    expect(values.length).toBeGreaterThan(0);
    for (const [name, value] of values) {
      expect(value, name).toMatch(/var\(--radius-(tag|input|card|hero|pill)\)/);
    }
  });
});

describe("the shell uses only tokens that exist (no silent no-op classes)", () => {
  /* Tailwind ships these; §11 does not override them, so they are allowed to resolve to Tailwind's
     own values. Anything else must name a §11 token — otherwise a typo renders as nothing at all,
     which is the failure mode this repo has already been bitten by twice (lint, test scripts). */
  const TAILWIND_BUILTIN = new Set([
    "text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl",
    "text-5xl", "text-6xl", "text-7xl", "text-8xl", "text-9xl",
    "text-left", "text-center", "text-right", "text-justify", "text-start", "text-end",
    "text-balance", "text-pretty", "text-wrap", "text-nowrap", "text-ellipsis", "text-clip",
    "font-thin", "font-extralight", "font-light", "font-normal", "font-medium",
    "font-sans", "font-serif", "font-mono",
    "bg-transparent", "border-none",
  ]);

  const classNames: string[] = [];
  for (const [, attribute] of `${page}${layout}`.matchAll(/className="([^"]+)"/g)) {
    if (attribute) classNames.push(...attribute.split(/\s+/).filter(Boolean));
  }
  const tokenish = classNames.filter(
    (c) => /^(text|bg|border|rounded|font|tracking|leading)-/.test(c) && !c.includes("["),
  );

  it("found some classes to check", () => {
    expect(tokenish.length).toBeGreaterThan(0);
  });

  it("names a token in @theme for every token-ish class", () => {
    const themeKeys = new Set([...Object.keys(themeMirror), ...Object.keys(themeInline)]);
    const unresolved = [...new Set(tokenish)]
      .filter((c) => !TAILWIND_BUILTIN.has(c))
      .filter((c) => {
        const rest = c.replace(/^(color|text|bg|border|rounded|font|tracking|leading)-/, "");
        return !(
          themeKeys.has(`--${c}`) ||
          themeKeys.has(`--color-${rest}`) ||
          themeKeys.has(`--text-${rest}`) ||
          themeKeys.has(`--font-${rest}`) ||
          themeKeys.has(`--radius-${rest}`)
        );
      });
    expect(unresolved).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------------------------
   Task 7.1 — the three assertions the token file was missing. Everything below measures the SAME
   declarations the blocks above parsed, so a colour edited in globals.css and not re-derived here
   fails an assertion instead of waiting for someone to notice on a screen.
   --------------------------------------------------------------------------------------------- */

/** A token's value as a 6-digit hex. Throws on a name that is not a colour rather than returning
    NaN and quietly turning the assertion into a no-op. */
function hexOf(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`${name} is not declared`);
  const trimmed = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    throw new Error(`${name} is not a 6-digit hex colour: ${value}`);
  }
  return trimmed;
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const channel = (start: number): number => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio. §9's 4.5:1 floor and §2.9's measured table are both this number. */
function contrast(a: string, b: string): number {
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

/** The pairs the design actually puts on screen. Every one answers to §9's 4.5:1. */
const TEXT_ON_SURFACE = [
  ["--color-ink", "--color-canvas"],
  ["--color-ink", "--color-surface"],
  ["--color-ash", "--color-canvas"],
  ["--color-ash", "--color-surface"],
  ["--color-positive", "--color-canvas"],
  ["--color-warning", "--color-canvas"],
  ["--color-negative", "--color-canvas"],
  ["--color-sienna", "--surface-insight"],
  /* §2.9 rule 1 — the primary button's label, now that the rule names its token. --color-on-action is
     #0c0a08 in both themes (16.02:1); --color-panel also passes (14.22 / 12.78) and stays asserted so a
     future remap back to it cannot regress silently. */
  ["--color-on-action", "--surface-action"],
  ["--color-panel", "--surface-action"],
  /* Status chips: the semantic colour on its own wash. Worst pair is light warning at 4.65:1. */
  ["--color-positive", "--wash-positive"],
  ["--color-warning", "--wash-warning"],
  ["--color-negative", "--wash-negative"],
  /* §2.9 rule 4 — the panel is dark in both themes, so it is the one surface that takes its own set. */
  ["--color-ash-on-panel", "--color-panel"],
  ["--color-positive-on-panel", "--color-panel"],
  ["--color-negative-on-panel", "--color-panel"],
] as const;

describe("text contrast (§9: AA 4.5:1 on every surface that carries text)", () => {
  for (const [theme, block] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`meets 4.5:1 for every declared pair in ${theme}`, () => {
      const below = TEXT_ON_SURFACE.map(([text, background]) => ({
        pair: `${text} on ${background}`,
        ratio: contrast(hexOf(block[text], text), hexOf(block[background], background)),
      })).filter(({ ratio }) => ratio < 4.5);

      expect(below).toEqual([]);
    });
  }

  it("keeps the on-panel set identical in all three blocks (§2.9 rule 4)", () => {
    const onPanel = ["--color-ash-on-panel", "--color-positive-on-panel", "--color-negative-on-panel"];
    for (const name of onPanel) {
      expect(hexOf(dark[name], name), `${name} in the dark block`).toBe(hexOf(light[name], name));
      expect(hexOf(themeMirror[name], name), `${name} in @theme`).toBe(hexOf(light[name], name));
    }
  });

  it("pins why rule 4 exists: the light semantic set fails on the panel", () => {
    /* Arithmetic, not taste. If this ever stops being true the rule is no longer needed — and that
       failure is the signal to revisit the rule, not to delete the on-panel tokens. */
    for (const name of ["--color-ash", "--color-positive", "--color-negative"]) {
      const ratio = contrast(hexOf(light[name], name), hexOf(light["--color-panel"], "--color-panel"));
      expect(ratio, `${name} on the light theme's panel`).toBeLessThan(4.5);
    }
  });

  it("pins the trap in rule 1: --color-ink cannot label the highlighter in dark", () => {
    /* Rule 1 says text on the highlighter stays dark "in both themes", but --color-ink IS bone in
       dark — so a component that reads the rule literally produces an invisible label. --color-panel
       is the token that satisfies it, and the pair list above asserts it. This test exists so the
       prose's ambiguity has a machine-checkable edge. */
    const inkOnAction = (block: Record<string, string>): number =>
      contrast(hexOf(block["--color-ink"], "--color-ink"), hexOf(block["--surface-action"], "--surface-action"));

    expect(inkOnAction(light)).toBeGreaterThan(4.5);
    expect(inkOnAction(dark)).toBeLessThan(4.5);
  });

  it("keeps --color-smoke out of the text roles (§9/§10: it fails at 1.34:1)", () => {
    for (const [theme, block] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      const ratio = contrast(
        hexOf(block["--color-smoke"], "--color-smoke"),
        hexOf(block["--color-canvas"], "--color-canvas"),
      );
      expect(ratio, `--color-smoke on the ${theme} canvas`).toBeLessThan(4.5);
    }
  });

  it("agrees with §2.9's measured table", () => {
    const claimedRatios = [
      [light, "--color-ink", "--color-canvas", 17.7],
      [dark, "--color-ink", "--color-canvas", 16.74],
      [dark, "--color-ash", "--color-canvas", 6.55],
      [dark, "--color-ink", "--color-panel", 14.12],
    ] as const;

    for (const [block, text, background, claimed] of claimedRatios) {
      const measured = contrast(hexOf(block[text], text), hexOf(block[background], background));
      expect(measured, `${text} on ${background}`).toBeCloseTo(claimed, 1);
    }
  });
});

describe("the hero inverts direction, not token (§2.9 rule 3)", () => {
  it("is darker than the canvas in light", () => {
    expect(luminance(hexOf(light["--color-panel"], "--color-panel"))).toBeLessThan(
      luminance(hexOf(light["--color-canvas"], "--color-canvas")),
    );
  });

  it("is lighter than the canvas in dark, where darker would be invisible", () => {
    expect(luminance(hexOf(dark["--color-panel"], "--color-panel"))).toBeGreaterThan(
      luminance(hexOf(dark["--color-canvas"], "--color-canvas")),
    );
  });

  it("is the same token name holding two different values", () => {
    expect(hexOf(light["--color-panel"], "--color-panel")).not.toBe(
      hexOf(dark["--color-panel"], "--color-panel"),
    );
  });
});

describe("no raw colour in a component (§11: components read the semantic layer)", () => {
  const REPO = fileURLToPath(new URL("../../", import.meta.url));
  /* globals.css IS the token file — the one place a colour literal belongs. */
  const TOKEN_FILE = fileURLToPath(new URL("../globals.css", import.meta.url));
  const ROOTS = ["app", "components", "src"];
  const SOURCE = /\.(tsx|css)$/;

  function walk(dir: string, found: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(join(REPO, dir));
    } catch {
      return found; // a directory that does not exist yet is not a failure
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (statSync(join(REPO, path)).isDirectory()) walk(path, found);
      else if (SOURCE.test(entry)) found.push(path);
    }
    return found;
  }

  const files = ROOTS.flatMap((root) => walk(root));

  it("found source files to check", () => {
    /* Anti-vacuity: this is worthless if the walk silently finds nothing, and the walk is the part
       most likely to break — it skips a directory that does not exist yet by design. */
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it("declares no colour literal outside the token file", () => {
    const offenders = files
      .filter((path) => join(REPO, path) !== TOKEN_FILE)
      .flatMap((path) =>
        stripComments(readFileSync(join(REPO, path), "utf8"))
          .split("\n")
          .map((line) => line.match(/#[0-9a-fA-F]{3,8}\b/)?.[0])
          .filter((literal): literal is string => literal !== undefined)
          .map((literal) => `${path}: ${literal}`),
      );

    expect(offenders).toEqual([]);
  });
});

describe("the focus ring is visible on what it is drawn on (§2.8, §9)", () => {
  /* The ring is drawn OUTSIDE the element (`outline-offset`), so it lands on the canvas or on a card —
     never on the control's own ink. These are the two backgrounds it actually meets. */
  const BEHIND_THE_RING = ["--color-canvas", "--color-surface"];

  for (const [theme, block] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`clears 3:1 against the canvas and a card in ${theme}`, () => {
      const below = BEHIND_THE_RING.map((background) => ({
        pair: `--color-focus-ring on ${background}`,
        ratio: contrast(
          hexOf(block["--color-focus-ring"], "--color-focus-ring"),
          hexOf(block[background], background),
        ),
      })).filter(({ ratio }) => ratio < 3);

      expect(below).toEqual([]);
    });
  }

  it("is ink in light and the accent in dark, which is the whole of the fix", () => {
    expect(hexOf(light["--color-focus-ring"], "--color-focus-ring")).toBe("#0c0a08");
    expect(hexOf(dark["--color-focus-ring"], "--color-focus-ring")).toBe("#e4f222");
  });

  it("pins why: the accent alone cannot be the ring in light", () => {
    const accentOnCanvas = contrast(
      hexOf(light["--color-highlighter"], "--color-highlighter"),
      hexOf(light["--color-canvas"], "--color-canvas"),
    );
    expect(accentOnCanvas).toBeLessThan(3);
  });
});
