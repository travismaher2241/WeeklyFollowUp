# Weekly Follow-Up

A read-only viewer of Plasgain's Ostendo job orders and quotes, for weekly follow-ups. Hosted on Vercel.

## Ostendo rules (from the handover guide, 18/11/2026)

- Read-only: the app only ever calls `GET {OSTENDO_API_URL}/tabledata`. Nothing is written to Ostendo.
- Called from server code only (`src/lib/ostendo.ts`), never from the browser.
- Settings live in Vercel: `OSTENDO_API_URL` and `OSTENDO_API_KEY` (Sensitive). The key never goes in code.
- Guard: https, host `plasgain.southeastit.com.au`, port `8843`. 45s timeout, no redirects, error-page detection, key scrubbed from messages, one table at a time.

## Temporary structure check

`/diagnostic` (preview deployments only) profiles candidate tables without showing any row data:
row counts, column names, fill %, status values, date formats and customer-link match rates.
Delete `src/app/diagnostic`, `src/app/api/ostendo/diagnostic`, `src/lib/diagnostic.ts` and `src/middleware.ts`
once the job and quote tables are confirmed.

## Where the data comes from (confirmed 18/11/2026)

Everything is in Ostendo's `JOBHEADER` table (about 9,200 rows, 70 MB in total, so the app reads it with a filter on `ORDERSTATUS`, one status at a time, cached for an hour).

| What | Column |
|---|---|
| List | `ORDERSTATUS` = `Open`, `InProgress` or `Quote` (superseded quote revisions, `QUOTEREVISIONSTATUS = Non Current`, are left out) |
| Entered date / quote date | `ORDERDATE` (m/d/yyyy, US order) |
| Required date | `REQUIREDDATE` (m/d/yyyy; 1900 and 2099 are placeholders for "not set") |
| Customer | `CUSTOMER` (100% match `CUSTOMERMASTER.CUSTOMER`) |
| Value ex GST | `ORIGINALORDERAMOUNT` |
| Salesperson | `SALESPERSON` |

The rules are in `src/lib/rules.ts`. The label for quotes over 3 months old is `OLD_QUOTE_LABEL` there.

## Meeting notes (Firebase)

The Meeting tab's notes are stored in Firebase Firestore, never in Ostendo: one document,
`weeklyFollowUp/meetingNotes`, so a page load costs a single read. Vercel settings needed (server-side only):
either `FIREBASE_SERVICE_ACCOUNT` (the whole service-account JSON, marked Sensitive) or
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. Without them, notes fall back
to the browser's local storage.

## Delivery confirmation copy (this branch)

This branch is a separate copy of the app, deployed to its own Vercel project, that adds customer delivery-date confirmations.
The live Weekly Follow-Up app is untouched.

- Staff page `/confirmations`: pick a customer with In-progress orders, enter one contact, and make a private link
  (unguessable, expires after 7 to 30 days). Nothing is emailed automatically.
- Customer page `/confirm/<token>`: their In-progress orders as they were when the link was made (PO, description, items,
  delivery date, no prices). Each order: date is correct, new date (weekdays only, at least 3 business days out), or date unknown with a note.
  Orders within 2 business days of their date are locked. Submit once, then the page locks and points to lightsales@plasgain.com.au.
- Storage: Firebase only. `deliveryConfirmLinks/{token}` per link, `deliveryConfirmApp/linkIndex` summary, and this copy's own
  meeting notes in `deliveryConfirmApp/meetingNotes`. The customer page never reads Ostendo.
- Sign in: because customer links must be public, every staff page needs `APP_PASSWORD` (8+ characters) set in Vercel.
- Vercel settings needed: `APP_PASSWORD`, `OSTENDO_API_URL`, `OSTENDO_API_KEY`, and the Firebase settings above.
- Local testing without Firebase: `CONFIRM_STORE=memory APP_PASSWORD=testpass123 npm run dev`, then open
  `/confirm/localTestLinkForTryingThePage001`.
