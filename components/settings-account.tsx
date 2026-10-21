"use client";

import { useActionState } from "react";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type PasswordState } from "@/app/(app)/settings/actions";

/*
 * §7 screen 13, "password" (Task 7.4g). The act itself lives in `changePassword` — this form is a
 * second door onto it, and the only rule here is the one the server cannot check: the two new-password
 * fields have to agree with each other, because the form is the only place both are visible.
 *
 * Everything else the server already says better. The route's own sentences (too short, unchanged,
 * wrong current password, locked out) are the actionable ones, so they are shown verbatim rather than
 * pre-empted by client validation.
 *
 * On success the fields clear but the section stays: the session that submitted survives the change
 * (ADR-0045 revokes the account's *other* sessions), so this screen is still the user's, and the
 * confirmation line is the evidence that it was the deliberate one.
 */

const INITIAL: PasswordState = { error: null, changed: false };

export function SettingsAccount({
  name,
  email,
  primaryCurrency,
}: {
  name: string;
  email: string;
  primaryCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(changePasswordAction, INITIAL);

  return (
    <div data-testid="settings-account" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-subheading text-ink">Account</h2>
          <p className="text-caption text-ash">The identity this ledger records against.</p>
        </div>
        <dl className="flex flex-col gap-2 text-body">
          <div className="flex flex-wrap gap-x-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd data-testid="account-name">{name}</dd>
          </div>
          <div className="flex flex-wrap gap-x-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd data-testid="account-email">{email}</dd>
          </div>
          <div className="flex flex-wrap gap-x-3">
            <dt className="text-muted-foreground">Primary currency</dt>
            {/* ADR-0015: permanent — every stored figure is denominated against it. Stated, not offered. */}
            <dd data-testid="account-currency">{primaryCurrency}</dd>
          </div>
        </dl>
      </div>

      <form action={formAction} data-testid="change-password-form" className="flex flex-col gap-3">
        <div>
          <h2 className="text-subheading text-ink">Password</h2>
          <p className="text-caption text-ash">Changing it signs out every other device.</p>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="newPassword">New password</Label>
          <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        {state.error !== null && (
          <p role="alert" data-testid="password-error" className="flex items-start gap-2 text-caption text-destructive">
            {/* §9: colour is never the only signal — an error carries an icon. */}
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{state.error}</span>
          </p>
        )}

        {state.changed && (
          <p data-testid="password-changed" className="flex items-start gap-2 text-caption text-ink">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Password changed. Every other device was signed out.</span>
          </p>
        )}

        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Changing…" : "Change password"}
        </Button>
      </form>
    </div>
  );
}
