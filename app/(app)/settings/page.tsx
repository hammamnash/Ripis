import { connection } from "next/server";
import { redirect } from "next/navigation";

import { SettingsAccount } from "@/components/settings-account";
import { SettingsData } from "@/components/settings-data";
import { ShellHeader } from "@/components/shell/header";
import { requireScreenSession } from "@/src/server/auth/require-screen";
import { getAccount } from "@/src/server/users/get-account";
import { calendarDate } from "@/src/server/time/calendar-date";

/*
 * Screen 13 (§7). Task 7.4f landed the Data section — screen 12 (Export) composed into Settings
 * rather than given its own rail entry, because the rail's five items are fixed (§6) and a file
 * feature is a setting, not a destination. Task 7.4g adds the account rows and the password form
 * beside it. Categories and reminders stay owed: they are screens 9 and 10's own features, and the
 * rail already reaches them.
 */
export default async function SettingsPage() {
  await connection();
  const { caller } = await requireScreenSession();

  /* The guard above just proved the session lives, so the account row exists — unless the account was
     deleted between the two reads. That is the same state as having no session at all, so it leaves the
     screen the same way: to the sign-in, not to a half-rendered page of placeholders. */
  const account = await getAccount(caller.id);
  if (account === null) redirect("/sign-in");

  return (
    <>
      <ShellHeader title="Settings" />

      <div className="flex flex-col gap-8 px-4 py-6">
        <SettingsAccount
          name={account.name}
          email={account.email}
          primaryCurrency={account.primaryCurrency}
        />
        <SettingsData today={calendarDate(new Date())} />
      </div>
    </>
  );
}
