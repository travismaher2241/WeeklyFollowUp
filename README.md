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
