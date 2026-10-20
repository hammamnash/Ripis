import { EmptyState } from "@/components/empty-state";
import { ShellHeader } from "@/components/shell/header";
import { Settings } from "lucide-react";

/* Screen 13 (§7). Primary currency, password, categories, wallets and reminders arrive in Task
   7.4g. The screen is a tab now so the rail's five items all lead somewhere real — a tab that 404s
   is worse than a screen that is not finished. */
export default function SettingsPage() {
  return (
    <>
      <ShellHeader title="Settings" />

      <div className="px-4 py-10">
        <EmptyState icon={Settings} title="Nothing to configure yet">
          Primary currency, password and category management land with the settings screen.
        </EmptyState>
      </div>
    </>
  );
}
