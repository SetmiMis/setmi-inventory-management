# FEATURE-015: UI/UX pass: logo, brand colours, easy menu, search anywhere

**Status:** IMPLEMENTED 2026-10-25. `typecheck`, `lint`, `build`, 42 unit tests pass. Checked on screen: the **login page** only (light and dark). Everything behind login (menu, search box, phone bar, empty states) is NOT yet seen on screen.
**Owner request:** make the system so easy that anyone can use it, at industry standard and enjoyable; use the logos from `Setmi_india_logos`; colours **#005A84** and **#EEF8FF**; add features; main focus UI/UX.

## 1. Brand
- Logos copied (resized, the 1 MB originals stay in the owner's folder) to `public/brand/`: `setmi-logo-wide.png` (the transparent wide logo, light text, used on the dark sidebar and the phone menu), `setmi-badge-256.png` / `-96.png` (round badge: login page, purchase-order print), and `src/app/icon.png` (browser tab icon).
- Colours: brand **#005A84** (buttons, links, active items) and page background **#EEF8FF** with white cards; borders and soft fills are light tints of the same blue (`src/app/globals.css`, the only place to change colours). Dark mode keeps its own steps.

## 2. What is easier now
| Change | Why (UX rule) |
|---|---|
| **Menu in groups** (Daily work, Inventory, Buying, Insights, Admin, Support) with small headings | A long flat menu is hard to scan; the most used jobs sit together |
| **Search anywhere (Ctrl+K or "/")**: finds items by code, name or barcode (a scanned barcode jumps straight to the item), any page, and quick actions (new item, new receipt, new purchase order, new transfer, stock out). Recently opened pages are listed first (remembered in this browser only) | One place to go anywhere; no hunting; works with a scanner |
| **Phone bottom bar** with the four most used jobs | Thumb reach; fewer taps for counter and godown staff |
| **Big touch targets**: buttons and fields at least 44 px high on phones and tablets (40 px with a mouse) | Touch target rule |
| **Friendly empty screens** (Items, Suppliers, Purchase orders, Receipts, Transfers) with an icon, a sentence on what the screen is for and the next button | A dead end ("No items found.") is replaced by a next step |
| **Readable lists**: soft row stripes, brand-coloured links, hover highlight | Easier to follow a row across a wide table |
| Calm motion respects the computer's "reduce motion" setting | Accessibility |
| Everything in English and Hindi (menu groups, search, quick actions, Help section "Search anything fast") | FEATURE-012 |

## 3. How it was checked
UX rules were taken from the `ui-ux-pro-max` skill (installed in this project) for enterprise dashboards and search (tables scroll on small screens, "no results" with a suggestion, search predictions as you type). The search is built with the combobox/listbox pattern (arrow keys, Enter, Esc, labelled dialog).

## 4. Limits and next steps
- Not seen on screen yet beyond the login page: please open the home page, press Ctrl+K, and try the phone view (browser width 400 px).
- The search lists up to 8 items; suppliers, purchase orders and bills are not searchable by number yet.
- The working screens (forms and tables) are still English; the bill receipt, order print and labels keep their plain print look.
- Ideas not done: saved filters, bulk actions in lists, a guided first-run tour, inline field help in long forms, keyboard shortcuts for the main jobs.
