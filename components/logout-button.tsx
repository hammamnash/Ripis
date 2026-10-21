"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Ends the browser session through the same server route used by API clients. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        setError("Could not sign out. Try again.");
        return;
      }

      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Could not sign out. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="destructive" onClick={logout} disabled={pending}>
        <LogOut aria-hidden="true" className="size-4" />
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error !== null ? <p role="alert" className="text-caption text-destructive">{error}</p> : null}
    </div>
  );
}
