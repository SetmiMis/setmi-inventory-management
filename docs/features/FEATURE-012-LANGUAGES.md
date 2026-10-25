# FEATURE-012: Two screen languages, English and Hindi (phase 1)

**Status:** IMPLEMENTED (phase 1) 2026-10-25. `typecheck`, `lint`, `build` pass. The language switch on the login page was clicked in a browser: the words changed to Hindi and back (checked as page text; a screenshot could not be taken). The screens behind login (menu, top bar, home, Help) are NOT yet seen in either language.
**Owner request:** "Give it in both" (English and Hindi), so that anyone can use it.

## 1. How it works
- A language switch "English | हिन्दी" is on the login page and in the top bar of every signed-in screen. The choice is stored in a cookie `ims_lang` for a year (default English). It changes words only; it never touches data or permissions. Only `en` and `hi` are accepted.
- Words live in `src/lib/i18n/messages.ts` (English master list, Hindi list with the same keys; TypeScript refuses a missing key). `tr(lang, key)` looks a word up. Help text lives in `src/app/(app)/help/help-content.ts` (two full lists).
- Font: Inter does not contain Hindi letters, so `Noto Sans Devanagari` is added through `next/font/google` (downloaded at build time, no npm package). See DEPENDENCIES.md.

## 2. What is translated now (phase 1)
| Area | English | Hindi |
|---|---|---|
| Menu, top bar, "Help" button, "Sign out", "Working in", inactive-account message | yes | yes |
| Login page | yes | yes |
| Home page (job buttons, first-time checklist, messages, permissions box) | yes | yes |
| Help page (16 sections) | yes | yes |

## 3. What is still English only (phase 2, not done)
All the working screens: Items, Stock, Receipts, Purchase orders, Transfers, Billing, Bills, Reports, Suppliers, Locations, Admin (their titles, form labels, buttons, table headings, error and success messages, printed pages). The Help page quotes the English button names for this reason (for example "Save and post"), so a Hindi reader can still find the right button.
Item and supplier names, and anything the users type, are shown as typed.

## 4. Why only phase 1 now
There are about 50 screens and several hundred strings. Translating them in one go, with nobody able to check the Hindi on screen, would risk wrong or broken words in places where mistakes cost money (bills, receipts). The shell and the Help were done first because every user sees them; the working screens should be done module by module and reviewed by a Hindi-reading staff member.

## 5. Limits and risks
- The Hindi wording was written by the AI and has not been checked by a native reader. Please have someone from the staff read the Hindi Help and menu and tell me which words to change (words are in two plain files, easy to edit).
- Mixed language: in Hindi mode the working screens are English until phase 2.
- Printed documents (bill receipt, purchase order, labels) are English.
