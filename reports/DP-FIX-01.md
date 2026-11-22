# DP-FIX-01 — Accept blank SitePulse driver details

## Change

The SitePulse dispatch create and update requests now treat `null`, empty strings, and whitespace-only values for optional `driverName`, `driverMobile`, `notes`, and `mixType` as not provided. Missing optional fields continue to work as before.

Required fields remain required. Invalid request messages now identify the field in plain language, such as `vehicleNo is missing`, instead of returning a raw Zod type error.

Vehicle numbers are still stored in uppercase, and nonblank driver details are still trimmed. The shared dispatch-creation and notification flow, SMS behavior, challan numbering, shared-key check, and SitePulse status callbacks were not otherwise changed. No database schema change was needed.

## Safety

- Tests used mocked storage and notification functions; no real dispatch, party, or site was created or changed.
- No production data was touched.
- No secret values were accessed or included in code or this report.
- The application was not published.

## Verification

- `npm run test:sitepulse` — 9 tests passed, including null/missing/blank create fields, mocked challan creation and notification, trimmed driver details, nullable PATCH fields, required `vehicleNo` error text, and existing SitePulse security tests.
- `npm run test:alerts` — 7 tests passed.
- `npm run build` — succeeded.
- `npm run check` — still reports 41 TypeScript errors in pre-existing Express route typings, the Admin party form, and the `web-push` type declaration; no diagnostics point to the new SitePulse validation/service module.
