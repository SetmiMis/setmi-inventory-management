"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT_DATASHEET, ACCEPT_IMAGES, BUCKET, MAX_IMAGES, checkDeclaredFile } from "@/lib/validation/files";
import { confirmUpload, removeFile, requestUpload, setMainImage } from "./file-actions";
import { primaryButton, secondaryButton } from "@/lib/ui";

export type StoredFile = { path: string; url: string | null };

export function FileManager({
  itemId,
  images,
  datasheet,
  canEdit,
}: {
  itemId: string;
  images: StoredFile[];
  datasheet: StoredFile | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<{ ok: boolean; text: string }> {
    // Quick check for fast feedback; the server checks again and also checks the real file bytes.
    const quick = checkDeclaredFile(file.type, file.size);
    if (!quick.ok) return { ok: false, text: `${file.name}: ${quick.message}` };

    const ticket = await requestUpload({ itemId, size: file.size, contentType: file.type });
    if (!ticket.ok) return { ok: false, text: `${file.name}: ${ticket.message}` };

    const { error } = await createClient()
      .storage.from(BUCKET)
      .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
    if (error) return { ok: false, text: `${file.name}: upload failed.` };

    const done = await confirmUpload({ itemId, path: ticket.path });
    return { ok: done.ok, text: `${file.name}: ${done.message}` };
  }

  async function onPick(input: HTMLInputElement | null) {
    const files = Array.from(input?.files ?? []);
    if (!input || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    const lines: string[] = [];
    let allOk = true;
    for (const f of files) {
      const r = await uploadOne(f); // one at a time keeps the 4-image rule simple
      lines.push(r.text);
      allOk = allOk && r.ok;
    }
    input.value = "";
    setMessage({ ok: allOk, text: lines.join(" ") });
    setBusy(false);
    router.refresh();
  }

  async function onMain(path: string) {
    setBusy(true);
    const r = await setMainImage({ itemId, path });
    setMessage({ ok: r.ok, text: r.message });
    setBusy(false);
    router.refresh();
  }

  async function onRemove(path: string) {
    if (!window.confirm("Remove this file?")) return;
    setBusy(true);
    const r = await removeFile({ itemId, path });
    setMessage({ ok: r.ok, text: r.message });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-medium">Images ({images.length} of {MAX_IMAGES})</h2>
        {images.length === 0 ? (
          <p className="text-sm text-neutral-500">No images yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {images.map((img, i) => (
              <li key={img.path} className="relative w-32 space-y-1">
                {i === 0 && <span className="absolute left-1 top-1 z-10 rounded bg-[var(--brand)] px-1.5 text-[10px] font-medium text-white">Main</span>}
                {img.url ? (
                  // Signed, expiring URL from a private bucket: Next image optimisation does not apply.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt="Item" className="h-32 w-32 rounded border border-neutral-300 object-cover" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded border text-xs">Unavailable</div>
                )}
                {canEdit && (
                  <div className="flex gap-1">
                    {i > 0 && <button type="button" disabled={busy} onClick={() => onMain(img.path)} className={`${secondaryButton} !px-2`}>Make main</button>}
                    <button type="button" disabled={busy} onClick={() => onRemove(img.path)} className={`${secondaryButton} !px-2`}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && images.length < MAX_IMAGES && (
          <div className="mt-2">
            <input ref={imageInput} type="file" accept={ACCEPT_IMAGES} multiple disabled={busy}
              aria-label="Add images" className="text-sm" />
            <button type="button" disabled={busy} onClick={() => onPick(imageInput.current)} className={`${primaryButton} ml-2`}>
              {busy ? "Uploading..." : "Upload images"}
            </button>
            <p className="mt-1 text-xs text-neutral-500">JPG, PNG or WebP, up to 5 MB each.</p>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">Datasheet</h2>
        {datasheet ? (
          <div className="flex items-center gap-3 text-sm">
            {datasheet.url ? (
              <a href={datasheet.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                Open datasheet (PDF)
              </a>
            ) : (
              <span>Datasheet unavailable</span>
            )}
            {canEdit && (
              <button type="button" disabled={busy} onClick={() => onRemove(datasheet.path)} className={secondaryButton}>
                Remove
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No datasheet yet.</p>
        )}
        {canEdit && (
          <div className="mt-2">
            <input ref={sheetInput} type="file" accept={ACCEPT_DATASHEET} disabled={busy}
              aria-label="Datasheet PDF" className="text-sm" />
            <button type="button" disabled={busy} onClick={() => onPick(sheetInput.current)} className={`${primaryButton} ml-2`}>
              {datasheet ? "Replace datasheet" : "Upload datasheet"}
            </button>
            <p className="mt-1 text-xs text-neutral-500">PDF, up to 10 MB.</p>
          </div>
        )}
      </div>

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
      )}
    </section>
  );
}
