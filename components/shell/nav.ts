import { ArrowLeftRight, ChartPie, House, Settings, Wallet } from "lucide-react";

/*
 * §6's five items, in one place: the phone's tab bar and the desktop rail render the same list, so a
 * destination cannot exist on one and be missing from the other.
 *
 * There is no sixth item. Recurring (screen 10) is V1.1, and a disabled tab for a screen that does
 * not exist is a promise the rail cannot keep.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budgets", label: "Budgets", icon: ChartPie },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** "/" would otherwise match every route, so the dashboard is exact and the rest match their subtree —
 *  /transactions/new keeps Transactions lit. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The one action the frame offers, and the screens it must not offer it on (§6): a button that opens
 *  the screen you are already on is the one place it is wrong. `/budgets/` with the slash is deliberate —
 *  it hides the action on the budgets *sub*-screens and leaves it on `/budgets` itself, where adding a
 *  transaction is still the useful act. */
export const ADD_HIDDEN_ON = ["/transactions/new", "/budgets/"] as const;

export function hidesAdd(pathname: string): boolean {
  return ADD_HIDDEN_ON.some((hidden) => pathname.startsWith(hidden));
}
