"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/*
 * Screen 14's sign-in half (§7). The app's only client-side form until Task 7.4c.
 *
 * It posts to `POST /api/auth/login` rather than calling `signIn()` directly, for one reason: the route
 * counts attempts against a per-address rate limit, and a second entry point that re-implemented the
 * counting would be a second place for that limit to be wrong. The response also carries the
 * `ripis_session` cookie the server components need (Task 7.4), which a fetch stores automatically.
 *
 * §8's voice: the error states the cause, and the cause comes from the API — "That email and password do
 * not match." — so there is no second copy of the wording here to drift.
 */

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

const FALLBACK = "That did not work. Check your connection and try again.";

export function SignInForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        /* Same-origin by default; stated because this is the request that *receives* the session cookie. */
        credentials: "same-origin",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        setError(body.error?.message ?? FALLBACK);
        return;
      }

      /* `replace`, not `push`: the sign-in screen is not somewhere the back button should return to once the
         session exists. The refresh is what re-renders the frame with the cookie this response just set. */
      router.replace("/");
      router.refresh();
    } catch {
      setError(FALLBACK);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={emailId} className="text-micro uppercase text-muted-foreground">
          Email
        </Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={passwordId} className="text-micro uppercase text-muted-foreground">
          Password
        </Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : errorId}
        />
      </div>

      {error !== null && (
        <p
          id={errorId}
          role="alert"
          data-testid="sign-in-error"
          className="flex items-start gap-2 text-caption text-destructive"
        >
          {/* §9: colour is never the only signal — an error carries an icon. */}
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
