# DP-FIX-03 — Delete party and site safely

Site deletion now checks for challans first. If any exist, it leaves the site and its counter unchanged and tells the Owner how many challans prevent deletion. If none exist, DispatchPro removes the challan counter and site in one transaction.

Party deletion checks for challans before removing anything. If any exist, it leaves the party and related records unchanged and returns the requested message. Otherwise, one transaction removes the sites' challan counters, the sites, the party's site counter, its access-link tokens, and then the party.

The Owner PIN checks were left in place. The refusal messages appear in the Owner confirmation dialog. No schema change was needed, and no production data was accessed or changed.

## Verification

- `npm run test:sitepulse` — 28 tests passed, including new safe-delete and refusal-message tests.
- `npm run test:alerts` — 7 tests passed.
- `npm run build` — passed.
- `npm run check` — reports 40 existing TypeScript errors in `server/routes.ts` and `server/push-notifications.ts`.

No screenshots were taken. The app was not published.
