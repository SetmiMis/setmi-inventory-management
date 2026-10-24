# FLOW (actual implemented flow)

Updated 2026-10-24 for P1 (login, guard, admin users).

## Every page request
```
Browser -> src/proxy.ts
   refresh Supabase session cookie; getClaims() verifies the token signature
   no valid session and path != /login  -> redirect /login
   valid session and path == /login     -> redirect /
   (convenience only, NOT the security check)
-> page / layout in src/app/(app)/
   layout.tsx  Shell -> requireUser() [src/lib/auth.ts]
        getUser() asks Supabase Auth server; reads profiles + user_permissions as the user
        no user -> /login ; user inactive -> shows "not active yet" instead of the page
   page.tsx    calls requireAdmin() / requirePermission(key) again for its own rule
-> Supabase (as the signed-in user): RLS policies decide what rows come back
```
Why checks are repeated: proxy = quick redirect, page = real server check, database RLS = last line of defence even if app code has a bug.

## Login
`login/page.tsx` -> `login-form.tsx` (client, useActionState) -> server action `login` in `login/actions.ts`:
zod validates email + password -> `supabase.auth.signInWithPassword` -> cookies set by `lib/supabase/server.ts` -> redirect `/`.
Any failure returns the same message ("Invalid email or password.") so email existence is not revealed.

## Logout
Header form -> server action `logout` in `(app)/actions.ts` -> `signOut` -> redirect `/login`.

## Admin: save a user (`/admin/users`)
`page.tsx` (requireAdmin; loads profiles, permissions, locations as the admin; RLS lets only admins read all profiles)
-> `user-form.tsx` (client form per user)
-> server action `saveUser` (`admin/users/actions.ts`):
   requireAdmin() -> zod parse (uuid user, known-shape permission keys, uuid locations)
   -> RPC `admin_set_user_permissions`, `admin_set_user_locations`, `admin_set_user_admin`, `admin_set_user_active`
   -> each RPC re-checks `is_admin()` in the database and writes an audit_log row
-> revalidatePath, result message shown next to the Save button.

## Item Master (P2a, implemented 2026-10-24; images/datasheet and Excel import NOT yet)
All under `src/app/(app)/items/`. Every page/action starts with `requirePermission(...)`.

| Route / action | Permission | What happens |
|---|---|---|
| `/items` (page.tsx) | items.view | URL params parsed and sanitised (`sanitizeSearch`, uuid check, whitelist for status/source, page clamp). Barcode matches fetched first, then one `items` query with `or(ilike...)`, filters, count, `range` (25 per page) |
| `/items/new` -> `createItem` | items.create | zod (`lib/validation/item.ts`) -> insert item (selling name falls back to item name) -> insert barcodes -> redirect to `/items/[id]`. If barcodes fail: redirect with `?warn=barcodes` |
| `/items/[id]` -> `updateItem` | items.edit | zod -> update `where id and updated_at = expected` (stops lost updates; 0 rows = "changed by someone else"). `selling_item_name` is sent only if user has items.edit_selling_name |
| `ArchiveControl` -> `setItemActive` | items.archive | sets `is_active` |
| `BarcodeManager` -> `addBarcode` / `removeBarcode` | items.edit | insert / delete one barcode |
| `/items/categories` -> `saveCategory` | categories.manage | create or rename / switch off a category |

### Images and datasheet (P2b, implemented 2026-10-24)
Files go browser -> Supabase Storage directly (Vercel limits request bodies to about 4.5 MB; datasheets can be 10 MB). Code: `items/[id]/file-manager.tsx` (browser), `items/[id]/file-actions.ts` (server), `lib/validation/files.ts` (rules).
```
FileManager (browser): quick type/size check
 -> requestUpload  [items.edit] server: re-check type/size, image count < 4, build path
                    items/{itemId}/{image|datasheet}-{random uuid}.{ext}  (uploader's file name is NEVER used)
                    -> createSignedUploadUrl -> returns one-time ticket
 -> browser: uploadToSignedUrl(ticket) straight to the private bucket item-files
    (bucket also enforces 10 MB and the 4 allowed MIME types)
 -> confirmUpload  [items.edit] server: path must match this item and the strict pattern;
                    downloads the stored file; checks size; checks REAL first bytes
                    (JPEG/PNG/WebP/PDF signature must match the kind and extension);
                    bad file -> deleted from the bucket and refused;
                    good file -> items.image_paths / datasheet_path updated
                    (WHERE updated_at = value just read; retried up to 3 times);
                    replaced datasheet -> old file removed
 -> removeFile     [items.edit] path must already belong to this item; array/column updated, then file removed
Item page: server creates signed view links (1 hour) for each file; bucket is private.
```
Known limit: an upload that is never confirmed (browser closed in between) leaves an orphan file in the bucket; a cleanup job is a later task.

Database errors go through `lib/db-errors.ts` so users see plain messages (duplicate code, no permission), never raw database text. Database triggers still enforce the same rules if the app code ever has a bug.

## Errors
Validation failure or database error is returned to the form as `{ok:false, message}` and shown in red. Not-signed-in and not-admin cases redirect.
