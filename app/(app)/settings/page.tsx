import { connection } from "next/server";

import { SettingsData } from "@/components/settings-data";
import { ShellHeader } from "@/components/shell/header";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { calendarDate } from "@/src/server/time/calendar-date";

/*
 * Screen 13 (§7). Task 7.4f lands the Data section here — screen 12 (Export) composed into Settings
 * rather than given its own rail entry, because the rail's five items are fixed (§6) and a file
 * feature is a setting, not a destination. Task 7.4g adds primary currency, password, categories and
 * reminders beside it.
 */
export default async function SettingsPage() {
  await connection();
  await requireScreenSession();

  return (
    <>
      <ShellHeader title="Settings" />

      <div className="px-4 py-6">
        <SettingsData today={calendarDate(new Date())} />
      </div>
    </>
  );
}
