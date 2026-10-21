/**
 * The one cookie this app sets, and the only reason it exists.
 *
 * Until 7.4, every request to the API carried its access token in an `Authorization` header, and that was
 * sufficient: a route handler is handed a `Request` and can read a header. A **server component is not** —
 * it receives no request object, so the token the browser holds in local storage is invisible to it, and
 * `GET /reports/wallet-summary` therefore had no way to know whose ledger to summarise. That is the gap this
 * module closes, and it is a gap rather than a preference: the alternative was fetching every screen's data
 * from the client, which would move the arithmetic into the browser and put the token somewhere XSS can read.
 *
 * What the cookie holds is the **session id**, not the access token. Two reasons, and the second is the one
 * that matters:
 *
 *   1. An access token expires in minutes. A cookie carrying one would bounce the user to the sign-in screen
 *      mid-session, and a server component cannot refresh it — `cookies().set()` is refused during render,
 *      so the refresh would have to live in middleware, which is a second authentication path to keep honest.
 *   2. The session id is already the authority. `requireSession` accepts an access token only if the session
 *      it names is still live (ADR-0041), so revocation — sign-out, password change, expiry — is enforced by
 *      one database read either way. The signature on the token proves who minted it; the row proves it is
 *      still valid, and the row is what this cookie is checked against.
 *
 * It is `HttpOnly` (no script can read it), `SameSite=Lax` (a cross-site POST does not carry it), and
 * `Secure` whenever the request actually arrived over TLS — decided per request rather than from
 * `NODE_ENV`, because `next start` on this machine serves plain HTTP and a `Secure` cookie there is silently
 * dropped, which would look exactly like a broken sign-in.
 */

export const SESSION_COOKIE = 'ripis_session';

/** Attributes shared by the set and the clear, because a browser matches all of them when clearing. */
function attributes(secure: boolean): string[] {
  return ['Path=/', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])];
}

/**
 * The `Set-Cookie` value for a fresh session.
 *
 * `Max-Age` is the session row's own lifetime, not the access token's: the cookie stops being sent when the
 * session it names would have expired anyway. The row is still checked on every request, so this is a hint
 * for the browser rather than a security control.
 */
export function sessionCookie(sessionId: string, maxAgeSeconds: number, secure: boolean): string {
  const maxAge = Math.max(0, Math.floor(maxAgeSeconds));

  return [`${SESSION_COOKIE}=${sessionId}`, `Max-Age=${maxAge}`, ...attributes(secure)].join('; ');
}

/**
 * The `Set-Cookie` value that removes it.
 *
 * Signing out already revokes the session, so this cookie would be inert the moment it was used — but leaving
 * a dead credential in the browser means every subsequent request carries a lookup that can only fail, and a
 * user who signs out expects the browser to forget.
 */
export function clearedSessionCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, 'Max-Age=0', ...attributes(secure)].join('; ');
}

/** Read the HttpOnly browser session id from a same-origin request. */
export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (cookie === null) return null;

  const value = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  return value === undefined || value === '' ? null : value;
}

/**
 * Whether this request arrived over TLS.
 *
 * Behind a proxy the URL is often `http://` even when the browser used HTTPS, so the forwarded header is
 * consulted first. It is only trusted for this decision — setting `Secure` wrongly breaks sign-in on HTTP and
 * omitting it on HTTPS weakens the cookie; neither is a place to be clever.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');

  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim().toLowerCase();
    if (first === 'https') return true;
    if (first === 'http') return false;
  }

  return new URL(request.url).protocol === 'https:';
}
