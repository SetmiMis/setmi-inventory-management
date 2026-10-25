# FEATURE-011: Easy for anyone to use (usability pass)

**Status:** IMPLEMENTED 2026-10-25. `typecheck`, `lint`, `build` and the 35 unit tests pass. NOT yet looked at on screen behind login (sign-in needed), and not tried with a real first-time user.
**Owner request:** "Make it so easy that anyone can use it."

## 1. What changed
| Change | Where | Why |
|---|---|---|
| **Help page** in simple Hinglish: 16 short sections (first login, items, labels, purchase orders, receiving, counting, transfers, billing, reports, places, suppliers, users, settings, scanner tips, "what to do if I made a mistake", word meanings) | `/help`, text in `src/app/(app)/help/help-content.ts` | A beginner can read the steps for exactly the job in front of them |
| **"Help" button in the top bar on every screen**; it opens the section for the screen you are on (for example on Receipts it opens "Maal aana") | `help-button.tsx`, `helpSectionFor()` | No searching; one click from any page |
| "Help" also in the left menu | layout | Always findable |
| **Home page rebuilt around jobs**: big buttons named by what you want to do ("Receive goods", "Count stock by scanning", "Make a bill"...), only the ones you may use | `/` | People think in jobs, not module names |
| **"Shuru kaise karein" checklist for the admin** (places, staff, items, suppliers, opening stock) with ticks taken from the real data and a link for each step; disappears when all done | `/` | The admin knows what to do first on day one |
| **Clear message when you open a page you have no permission for** (before, the app silently sent you home) | `requirePermission`, `requireAdmin`, `requireAnyPermission` now redirect to `/?denied=1`; home shows the message | "I clicked and nothing happened" confusion |
| Plain wording for the empty state of home when no permission is given | `/` | Tells the person to ask the admin |

## 2. How the Help text was kept true
Every button name used in Help (for example "Check file (nothing is saved yet)", "Save and send (stock leaves)", "Archive item", "Restore item", the "opening stock" tick, "Recall") was checked against the real screens before writing. Where the system works differently from what one would guess it says so (new logins are made in the Supabase dashboard; the admin then ticks Active).

## 3. Decisions and assumptions (see ASSUMPTIONS.md)
- Help is written in Roman Hindi mixed with English product words, because that is how the owner talks. Buttons and labels in the app stay in English. A full Hindi screen language was not built.
- The authorization change is only the place the person is sent to after a refusal; the rules themselves are unchanged.

## 4. Not done (ideas for later)
- A real first-time-user test: ask someone new to do "receive goods" using only the app and note where they stop.
- Hindi labels on screens (needs the owner's wish and a translation pass).
- Short video or screenshots in Help.
- Field-level hints inside long forms and a "what does this page do" line under every title.
