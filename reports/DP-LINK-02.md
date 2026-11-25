# DP-LINK-02 — Accept party details from SitePulse orders

## What changed

SitePulse order requests can now include an optional `partyDetails` object. DispatchPro saves any non-blank supplied values to the matching party. Supplied values replace existing values; omitted or blank values leave existing data unchanged. The endpoint does not change a party's name, code, access id, or status.

The Owner's party add and edit form and party list now show Contact person and Mobile alongside Address, GST No, and PAN No. These fields remain optional.

## Migration

Migration: `migrations/0003_sitepulse_party_details.sql`

SQL:

```sql
ALTER TABLE parties ADD COLUMN contact_person TEXT;
ALTER TABLE parties ADD COLUMN mobile TEXT;
```

This additive migration was applied to the development database only. No production schema or data was changed.

## Accepted request shape

The order request keeps its existing required fields and may include:

```json
{
  "partyDetails": {
    "address": "42 Road",
    "gstNo": "GST-1",
    "panNo": "PAN-1",
    "contactPerson": "Casey",
    "mobile": "9876543210"
  }
}
```

Every property inside `partyDetails` is optional. Values are trimmed strings. Address allows up to 300 characters; the other values allow up to 100 characters each. No unknown keys are allowed inside the object. Requests without `partyDetails` continue to work as before.

## Verification

- `npm run test:sitepulse` — 23 tests passed, including existing truck and shared-key coverage.
- `npm run test:alerts` — 7 tests passed.
- `npm run build` — passed.
- `npm run check` — still reports 40 existing TypeScript errors in `server/routes.ts` and `server/push-notifications.ts`; there are no reported errors in the changed client, order handler, schema, or tests.

No screenshots were taken. No secrets were accessed or displayed. The app was not published.
