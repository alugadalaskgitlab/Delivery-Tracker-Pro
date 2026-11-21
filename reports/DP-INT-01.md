# DP-INT-01 — SitePulse integration

## Endpoints

All inbound endpoints require `X-SitePulse-Key` to match the DispatchPro secret `SITEPULSE_SHARED_SECRET`. Requests are rate-limited and logged with the timestamp, external reference when available, and HTTP result. The key is never logged.

### Create a dispatch

`POST /api/integrations/sitepulse/dispatches`

```http
X-SitePulse-Key: <dummy-key>
Content-Type: application/json
```

```json
{
  "externalRef": "sitepulse-dispatch-123",
  "siteId": "dispatchpro-site-id",
  "vehicleNo": "KA01AB1234",
  "loadMT": 18.5,
  "driverName": "Example Driver",
  "driverMobile": "9000000000",
  "notes": "Example",
  "mixType": "DBM"
}
```

Successful creation returns HTTP 201:

```json
{ "id": "dispatchpro-dispatch-id", "challanNo": "SITE-0001", "status": "DISPATCHED" }
```

Repeating the same `externalRef` returns the existing dispatch without creating a second one. Dispatch creation uses the shared normal creation path, preserving challan numbering, push notifications, SMS, and socket updates.

### Update or cancel a dispatch

`PATCH /api/integrations/sitepulse/dispatches/:externalRef`

Editable fields: `vehicleNo`, `loadMT`, `driverName`, `driverMobile`, and `notes`. To cancel, send only:

```json
{ "cancelled": true }
```

The response includes `id`, `challanNo`, and `status`. Changes are rejected after the dispatch is marked LEFT in SitePulse / UNLOADED in DispatchPro.

Example update response:

```json
{ "id": "dispatchpro-dispatch-id", "challanNo": "SITE-0001", "status": "DISPATCHED" }
```

### List active sites

`GET /api/integrations/sitepulse/sites`

Returns active parties and active sites with `partyId`, `partyName`, `partyCode`, `siteId`, `siteCode`, `siteName`, `mixType`, and `orderedMT`.

Example response:

```json
[
  {
    "partyId": "dispatchpro-party-id",
    "partyName": "Example Party",
    "partyCode": "EP",
    "siteId": "dispatchpro-site-id",
    "siteCode": "SITE",
    "siteName": "Example Site",
    "mixType": "DBM",
    "orderedMT": "250.00"
  }
]
```

## Status callbacks

SitePulse-originated dispatches enqueue ARRIVED and LEFT callbacks to `SITEPULSE_BASE_URL/api/integrations/dispatchpro/status`. Delivery runs in the background, retries with exponential backoff for up to 24 hours, and does not block site actions. DispatchPro's local UNLOADED status maps to the integration status LEFT. Ordinary dispatches do not enqueue callbacks.

Callback request example:

```http
POST /api/integrations/dispatchpro/status
X-SitePulse-Key: <dummy-key>
Content-Type: application/json
```

```json
{
  "externalRef": "sitepulse-dispatch-123",
  "challanNo": "SITE-0001",
  "status": "LEFT",
  "at": "2026-11-21T10:30:00.000Z",
  "byName": "Example Receiver"
}
```

## Migration

`migrations/0001_sitepulse_integration.sql` adds nullable `external_ref` and `external_source` columns, a unique constraint on `external_ref` (multiple nulls remain allowed), and the additive status-callback outbox table and index. The migration was applied to the development database only; production was not changed.

## Verification

- `npm run test:sitepulse`: 4 tests passed (missing key, wrong key, correct key, and rate limiting).
- `npm run check`: currently fails on existing TypeScript diagnostics in the project, including existing route parameter typing, a party form type, and the missing `web-push` declaration. No diagnostics were emitted for the new SitePulse modules or integration handlers.
- Database-backed endpoint tests were not run. Production data was not touched.
- `SITEPULSE_BASE_URL` and `SITEPULSE_SHARED_SECRET` are configured in Replit Secrets. Their values are intentionally omitted.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are configured in Replit Secrets; no VAPID values remain in `.replit`, code, or this report. Copy `SITEPULSE_SHARED_SECRET` into SitePulse's Secrets under the same name.
