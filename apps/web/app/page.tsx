/* Placeholder home. Task 7.3/7.4 replace this with the mobile shell and the 14 screens; it exists
   so the shell has something token-correct to render — the scaffold's page hard-coded zinc/black,
   an Arial font stack and a `font-semibold` heading, and §2.3 bans 600 and 700 outright. */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="font-serif text-heading leading-[var(--leading-heading)] tracking-[var(--tracking-tight)] text-ink">
        Ripis
      </h1>
      <p className="text-body text-ash">
        One private, multi-currency ledger. Both themes are live from this commit.
      </p>
    </main>
  );
}
