"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportSummaryAction } from "@/app/(app)/settings/actions";

/*
 * Settings → Data (screen 12, Task 7.4f; §12, FR-12). One section, Export above Import — the
 * decided default from the phase handoff, because the two halves of ADR-0008 are one story: the file
 * you download is the file you can bring back.
 *
 * The buttons talk to the API routes directly rather than through server actions: the routes answer
 * with the file itself, and a server action cannot hand a browser a download. The routes re-check the
 * session cookie, so nothing here is trusted that the server does not re-derive.
 */

const FORMATS = [
  { value: "cashbook", label: "Cashbook", note: "round-trips through Import below" },
  { value: "xlsx", label: "Spreadsheet", note: "one row per transaction" },
] as const;

type Format = (typeof FORMATS)[number]["value"];

function firstOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/** Bytes to base64, in chunks: `String.fromCharCode(...bytes)` on an 8 MB file overflows the argument list. */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** The server names the file in `content-disposition`; the download keeps that name, range and all. */
function filenameFrom(response: Response): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
  return match?.[1] ?? "ripis-export.xlsx";
}

async function jsonError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `The server answered ${response.status}.`;
  } catch {
    return `The server answered ${response.status}.`;
  }
}

export function SettingsData({ today }: { today: string }) {
  const [startDate, setStartDate] = useState(firstOfMonth(today));
  const [endDate, setEndDate] = useState(today);
  const [format, setFormat] = useState<Format>("cashbook");
  const [summary, setSummary] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloading, startDownload] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  /* The summary is a server read, so it is debounced like every other one (~300ms): a person dragging
     a date picker would otherwise fire one count query per change. */
  const debounce = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      void exportSummaryAction({ from: startDate, to: endDate }).then((result) => {
        if (result.error !== null) {
          setSummary(null);
          setExportError(result.error);
        } else {
          setExportError(null);
          const n = result.count ?? 0;
          setSummary(n === 1 ? "1 transaction in this range" : `${n} transactions in this range`);
        }
      });
    }, 300);
    return () => window.clearTimeout(debounce.current);
  }, [startDate, endDate]);

  const download = () =>
    startDownload(async () => {
      setExportError(null);
      try {
        const response = await fetch(`/api/export/${format}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startDate, endDate }),
        });
        if (!response.ok) {
          setExportError(await jsonError(response));
          return;
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filenameFrom(response);
        /* Chrome ignores a download click on an anchor that is not in the document — the same reason
           file-saver appends before clicking. The grace period is because Chromium reads the blob on the
           next task, not during click(): revoking here would cancel the download before it has the bytes. */
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        setExportError("The download could not start.");
      }
    });

  const runImport = () =>
    startImport(async () => {
      setImportError(null);
      setImportResult(null);
      if (file === null) {
        setImportError("Choose a cashbook file first.");
        return;
      }
      try {
        const response = await fetch("/api/import/cashbook", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentBase64: await toBase64(file) }),
        });
        if (!response.ok) {
          setImportError(await jsonError(response));
          return;
        }
        const s = (await response.json()) as {
          rows: number;
          transactions: number;
          walletsCreated: number;
          categoriesCreated: number;
        };
        setImportResult(
          `Imported ${s.transactions} transactions from ${s.rows} rows` +
            (s.walletsCreated > 0 ? `, created ${s.walletsCreated} wallets` : "") +
            (s.categoriesCreated > 0 ? `, created ${s.categoriesCreated} categories` : "") +
            ".",
        );
        setFile(null);
      } catch {
        setImportError("The file could not be sent.");
      }
    });

  return (
    <section data-testid="settings-data" className="flex flex-col gap-8">
      <div data-testid="export-section" className="flex flex-col gap-3">
        <div>
          <h2 className="text-subheading text-ink">Export</h2>
          <p className="text-caption text-ash">Download your ledger as a spreadsheet.</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="startDate">From</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="endDate">To</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              min={startDate}
              max={today}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-caption text-ash">Format</legend>
          <div className="flex flex-col gap-2">
            {FORMATS.map((option) => (
              <label key={option.value} className="flex flex-wrap items-center gap-2 text-body">
                <input
                  type="radio"
                  name="format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={() => setFormat(option.value)}
                />
                {option.label}
                <span className="text-caption text-ash">({option.note})</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div data-testid="export-summary" className="text-caption text-ash">
          {summary ?? "Counting rows…"}
        </div>
        {exportError !== null && (
          <p data-testid="export-error" className="text-caption text-negative">
            {exportError}
          </p>
        )}

        <div>
          <Button onClick={download} disabled={downloading || summary === null}>
            {downloading ? "Preparing…" : "Download export"}
          </Button>
        </div>
      </div>

      <div data-testid="import-section" className="flex flex-col gap-3">
        <div>
          <h2 className="text-subheading text-ink">Import</h2>
          <p className="text-caption text-ash">
            Bring a cashbook export back in. Importing a file twice adds its rows twice — export first if
            this ledger already holds that history.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="import-file">Cashbook file</Label>
          <Input
            id="import-file"
            data-testid="import-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {importResult !== null && (
          <p data-testid="import-summary" className="text-caption text-positive">
            {importResult}
          </p>
        )}
        {importError !== null && (
          <p data-testid="import-error" className="text-caption text-negative">
            {importError}
          </p>
        )}

        <div>
          <Button variant="tertiary" onClick={runImport} disabled={importing || file === null}>
            {importing ? "Importing…" : "Import cashbook"}
          </Button>
        </div>
      </div>
    </section>
  );
}
