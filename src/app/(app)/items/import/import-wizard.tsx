"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { commitImport, previewImport, type CommitResult, type PreviewState } from "./actions";
import { inputClass, primaryButton } from "@/lib/ui";

export function ImportWizard() {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewImport, null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [generate, setGenerate] = useState(true);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [committing, startCommit] = useTransition();

  const ready = preview && preview.ok ? preview : null;
  const errorRows = new Set(ready?.check.errors.map((e) => e.row));
  const hasErrors = (ready?.check.errors.length ?? 0) > 0;
  const toCreate = ready ? (hasErrors && !skipInvalid ? 0 : ready.check.valid) : 0;

  function onImport() {
    if (!ready) return;
    startCommit(async () => {
      setResult(await commitImport({ rows: ready.rows, skipInvalid, generateBarcodes: generate }));
    });
  }

  if (result?.ok) {
    return (
      <section role="status" className="space-y-3 rounded border border-green-600 p-4">
        <p className="font-medium">
          Done: {result.created} item{result.created === 1 ? "" : "s"} created
          {result.categoriesCreated > 0 ? `, ${result.categoriesCreated} new categor${result.categoriesCreated === 1 ? "y" : "ies"}` : ""}
          {result.skipped > 0 ? `, ${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped` : ""}.
        </p>
        <Link href="/items" className={primaryButton + " inline-block"}>View items</Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <form action={previewAction} className="space-y-3 rounded border border-neutral-300 p-4">
        <label className="block text-sm font-medium" htmlFor="file">Excel file (.xlsx, up to 3 MB)</label>
        <input id="file" name="file" type="file" required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className={inputClass} />
        <button type="submit" disabled={previewing} className={primaryButton}>
          {previewing ? "Checking..." : "Check file (nothing is saved yet)"}
        </button>
      </form>

      {preview && !preview.ok && (
        <p role="alert" className="rounded border border-red-500 p-3 text-sm text-red-600">{preview.message}</p>
      )}

      {ready && (
        <section className="space-y-4">
          <div className="rounded border border-neutral-300 p-4 text-sm">
            <p className="font-medium">{ready.fileName}</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>{ready.check.total} item rows read{ready.skippedEmpty > 0 ? `; ${ready.skippedEmpty} empty rows skipped (no Item_Name)` : ""}.</li>
              <li className="text-green-700">{ready.check.valid} rows are ready to import.</li>
              {hasErrors && <li className="text-red-600">{ready.check.errors.length} problem(s) in {errorRows.size} row(s), listed below.</li>}
              {ready.check.newCategories.length > 0 && <li>New categories to be created: {ready.check.newCategories.join(", ")}.</li>}
              {ready.ignoredColumns.length > 0 && <li>Columns not imported: {ready.ignoredColumns.join(", ")}.</li>}
              {ready.tooManyRows && <li className="text-red-600">Only the first 2000 item rows are used.</li>}
              <li className="text-neutral-500">Item image and datasheet columns are not imported; add files on each item page.</li>
            </ul>
          </div>

          {hasErrors && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-neutral-300"><th className="py-1 pr-3">Excel row</th><th className="pr-3">Column</th><th>Problem</th></tr></thead>
                <tbody>
                  {ready.check.errors.slice(0, 200).map((e, i) => (
                    <tr key={i} className="border-b border-neutral-200">
                      <td className="py-1 pr-3">{e.row}</td><td className="pr-3">{e.field}</td><td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ready.check.errors.length > 200 && <p className="text-xs text-neutral-500">Showing the first 200 problems.</p>}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-neutral-300">
                <th className="py-1 pr-3">Row</th><th className="pr-3">Code</th><th className="pr-3">Item name</th><th className="pr-3">Category</th><th className="pr-3">Source</th><th>Status</th>
              </tr></thead>
              <tbody>
                {ready.rows.slice(0, 50).map((r) => (
                  <tr key={r.row} className="border-b border-neutral-200">
                    <td className="py-1 pr-3">{r.row}</td><td className="pr-3">{r.internal_item_code}</td>
                    <td className="pr-3">{r.item_name}</td><td className="pr-3">{r.category}</td><td className="pr-3">{r.purchase_source}</td>
                    <td className={errorRows.has(r.row) ? "text-red-600" : "text-green-700"}>{errorRows.has(r.row) ? "Problem" : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ready.rows.length > 50 && <p className="text-xs text-neutral-500">Showing the first 50 of {ready.rows.length} rows.</p>}
          </div>

          <div className="space-y-2 rounded border border-neutral-300 p-4 text-sm">
            {hasErrors && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
                Import the {ready.check.valid} good rows and skip the rows with problems
                <span className="text-neutral-500">(otherwise nothing is imported until the file is fixed)</span>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} />
              Generate a SETMI barcode (EAN-13) for every new item
            </label>
            <button type="button" onClick={onImport} disabled={committing || toCreate === 0} className={primaryButton}>
              {committing ? "Importing..." : toCreate === 0 ? "Nothing to import yet" : `Import ${toCreate} item${toCreate === 1 ? "" : "s"}`}
            </button>
            {result && !result.ok && (
              <p role="alert" className="text-red-600">{result.message}</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
