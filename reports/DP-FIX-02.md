# DP-FIX-02 — Accept SitePulse edits with trip identity fields

## Change

SitePulse PATCH requests may now include `externalRef` and `siteId` alongside editable dispatch fields. The reference must match the trip reference in the URL, and the site must match the dispatch's existing site. A mismatch is rejected with a clear error.

The two identity fields are used only for these checks; they are never saved. Updates still change only vehicle number, load, driver details, notes, or mix type. Unknown fields remain rejected, and at least one editable field is still required. Existing challan numbers and edit notification behavior are unchanged. No database schema change was needed.

## Safety

- Tests used mock dispatch data and did not create or change any real dispatch, party, or site.
- No production data was touched.
- No secret values were accessed or included in code or this report.
- The application was not published.

## Verification

- `npm run test:sitepulse` — 14 tests passed, including the SitePulse security tests and the matching identity, mismatched site, mismatched reference, unknown field, and identity-only PATCH cases.
- `npm run test:alerts` — 7 tests passed.
- `npm run build` — succeeded.
