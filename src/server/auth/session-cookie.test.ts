import { describe, expect, it } from 'vitest';

import { clearedSessionCookie, isSecureRequest, sessionCookie, SESSION_COOKIE } from './session-cookie';

const config = { secure: true, insecure: false };

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe('the session cookie', () => {
  it('names the session and outlives a navigation but not the session row', () => {
    const header = sessionCookie('session-1', 2_592_000, config.insecure);

    expect(header).toBe(`${SESSION_COOKIE}=session-1; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`);
  });

  it('is HttpOnly and SameSite, because the point is that script cannot read it and a cross-site POST cannot send it', () => {
    const header = sessionCookie('session-1', 60, config.insecure);

    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    /* Lax rather than Strict: a Strict cookie is withheld on a top-level navigation *into* the app from
       an email or a bookmark, which signs the user out of a cold start for no security gain here. */
    expect(header).not.toContain('SameSite=Strict');
  });

  it('adds Secure only when the request arrived over TLS', () => {
    expect(sessionCookie('session-1', 60, config.secure)).toContain('; Secure');
    expect(sessionCookie('session-1', 60, config.insecure)).not.toContain('Secure');
  });

  it('never emits a negative or fractional Max-Age', () => {
    expect(sessionCookie('session-1', -5, config.insecure)).toContain('Max-Age=0');
    expect(sessionCookie('session-1', 12.9, config.insecure)).toContain('Max-Age=12');
  });

  it('clears with the same attributes it set', () => {
    const cleared = clearedSessionCookie(config.insecure);

    expect(cleared.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('Path=/');
    expect(cleared).toContain('HttpOnly');
  });
});

describe('whether a request is secure', () => {
  it('believes the URL when nothing is forwarded', () => {
    expect(isSecureRequest(request('https://ripis.test/'))).toBe(true);
    expect(isSecureRequest(request('http://127.0.0.1:3100/'))).toBe(false);
  });

  it('prefers the forwarded scheme, because a proxy makes the URL lie', () => {
    expect(isSecureRequest(request('http://ripis.test/', { 'x-forwarded-proto': 'https' }))).toBe(true);
    expect(isSecureRequest(request('https://ripis.test/', { 'x-forwarded-proto': 'http' }))).toBe(false);
  });

  it('reads only the first hop of a forwarded chain', () => {
    expect(isSecureRequest(request('http://ripis.test/', { 'x-forwarded-proto': 'https, http' }))).toBe(true);
    expect(isSecureRequest(request('https://ripis.test/', { 'x-forwarded-proto': 'http, https' }))).toBe(false);
  });

  it('falls back to the URL when the header names something else entirely', () => {
    expect(isSecureRequest(request('https://ripis.test/', { 'x-forwarded-proto': 'wss' }))).toBe(true);
  });
});
