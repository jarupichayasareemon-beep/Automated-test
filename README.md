# Playwright i18n tests — Buyer Profile Payment (Saved Cards)

Automated UI tests that verify the Saved Cards page at
`https://dev.ticketmelon.com/user/payment` shows the correct translated text
in all 9 languages, based on
`data/buyer-profile-payment-container.csv` (a copy of
*Copy 2 Localization language [Profile payment] - 12. buyer-profile-payment-container.csv*).

## What this checks

All four `test.describe.serial` blocks below live in one file,
**`tests/localize-saved-card.spec.ts`** — each keeps its own shared
page/account (see the comments at the top of the file for why merging the
file doesn't merge their state):

- **Main text translations** — for each of the 9 languages: page title, the
  PCI/security info banner, and the "Default"/"Expired" card badges (if
  present for the logged-in account's cards).
- **Delete confirmation dialog translations** — for each of the 9 languages:
  opens the "⋮" menu → "Delete" on the first saved card, checks the
  confirmation dialog's title/description/buttons, then clicks **Cancel**
  (never deletes).
- **Empty state translations** — for each of the 9 languages: logs in as a
  second account with zero saved cards (`TEST_EMPTY_EMAIL`) and checks
  `empty_card_title` / `empty_card_description`.
- **Set-as-default confirmation dialog translations** — for each of the 9
  languages: opens the "⋮" menu → "Set as default" on the second saved
  card, checks the confirmation dialog's title/description/buttons, then
  clicks **Cancel** (never changes the default).

Not covered yet (would need specific test data or additional flows — ask if
you want these added):
- Pagination (`paginate_*`) — needs a test account with enough cards to
  paginate.
- Toasts (`card_delete_success`, `default_card_updated`, error messages) —
  needs a disposable card to actually delete/update, or network mocking.
- `dialog_warning_delete_content` (shown when trying to delete the *default*
  card) — depends on which card you click delete on.

## Setup

```bash
cd playwright-i18n-buyer-payment
npm install
npx playwright install chromium
cp .env.example .env   # then fill in TEST_EMAIL / TEST_PASSWORD, see below
```

## Authentication

`tests/helpers/auth.ts` logs in for real against the dev-env sign-in page
(`https://dev.ticketmelon.com/authen/sign-in?redirect_url=`) using the
email/password inputs' ids (`#input-input-username`, `#input-input-password`)
and the submit button's id (`#btn-submit-login`) — ids rather than
placeholder text or accessible names, because the sign-in page's language
isn't guaranteed to be English (it follows whichever language the site last
had selected).

**What was *not* verified**: the actual sign-in submission. Entering a
password into a live form isn't something this assistant does on your
behalf, so the full login → redirect flow hasn't been run end-to-end. Things
to double check the first time you run the suite:
- `TEST_PASSWORD` in `.env` (see `.env.example` — `TEST_EMAIL` is pre-filled
  with `jarupichaya.sar@mtel.co.th`, but the password was intentionally not
  written to disk).
- The `page.waitForURL(...)` predicate in `login()` — it just waits for the
  URL to leave `/authen/sign-in`, since the real post-login redirect target
  wasn't observed. Adjust if login lands somewhere unexpected.

If you'd rather not put credentials in an env file at all, use Playwright's
`storageState` instead: log in once manually, run
`await context.storageState({ path: 'storageState.json' })`, point
`playwright.config.ts` at it (`use: { storageState: 'storageState.json' }`),
and remove the `await login(page)` calls from the spec files. See
[Playwright's auth guide](https://playwright.dev/docs/auth).

## Running

```bash
npm test              # headless
npm run test:headed   # see the browser
npm run test:ui       # Playwright's interactive UI mode, good for debugging
npm run report        # open the last HTML report
```

## Important things learned while exploring the real site

- **Language must be switched by clicking the UI dropdown, not by URL.**
  Navigating directly to a locale-prefixed URL (e.g.
  `/ms-MY/user/payment`) does **not** reliably switch the language — the app
  redirected back to whichever language was last selected through the UI
  (the preference seems to be stored per-account or in a cookie, and
  overrides the URL). `tests/helpers/language.ts` clicks through the actual
  dropdown instead, which was verified to work for every language tested
  (English, ไทย, 中文, Melayu).
- **The language switcher dropdown** is a button in the header showing the
  current language name next to a globe icon; clicking it opens a menu
  (`role="menuitem"`) with fixed native-language labels in this order:
  English, ไทย, 中文, Melayu, Tiếng Việt, Indonesia, 한국어, 日本語, 繁體中文.
  These labels don't change based on the current UI language, which is why
  `utils/i18n.ts` hardcodes them separately from the CSV locale codes.
- **No stable `data-testid`s were found** on interactive elements (delete
  menu button, kebab menu, etc.) — the app appears to use a component
  library without exposing test ids, and deeper DOM inspection was blocked
  by the browser tool's safety filters. The delete-dialog test therefore
  locates elements by visible text and rough DOM proximity, which is more
  fragile than a `data-testid` selector would be. If you have access to the
  frontend source, adding `data-testid` attributes to the kebab-menu button
  and dialog would make `tests/localize-saved-card.spec.ts`'s delete-dialog
  block much more robust.
  In the meantime, use `npx playwright codegen
  https://dev.ticketmelon.com/user/payment` to verify/record the exact
  selector against the live page if the heuristic locator breaks.

## Project structure

```
playwright-i18n-buyer-payment/
├── data/buyer-profile-payment-container.csv   # translation source of truth
├── utils/i18n.ts                              # CSV loader + t(key, locale) helper
├── tests/
│   ├── helpers/
│   │   ├── auth.ts          # logs in via the dev/TestProd sign-in pages
│   │   └── language.ts      # switches UI language via the dropdown
│   └── localize-saved-card.spec.ts
├── playwright.config.ts
├── package.json
└── .env.example
```

## Adding more languages/keys later

Everything reads from `data/buyer-profile-payment-container.csv` via
`t(key, localeCode)` in `utils/i18n.ts`. To test another CSV export for a
different page/component, copy it into `data/`, point a new spec file at it,
and reuse `loadTranslations` / `createTranslator` / `switchLanguage`.
