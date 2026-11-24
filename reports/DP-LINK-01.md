# DP-LINK-01 — Create or update SitePulse supply orders

## Change

Added `POST /api/integrations/sitepulse/orders`, protected by the same shared-key middleware as the SitePulse dispatch endpoints. It accepts a SitePulse order ID, party and site IDs and names, order number, mix lines, period, and open/closed status. Validation errors name the offending field. The response includes the DispatchPro party and site IDs and order ID.

The request fields are `sitePulseOrderId`, `partyName`, `sitePulsePartyId`, `siteName`, `sitePulseSiteId`, `orderNumber`, `mixLines` (`mix`, `orderedMT`), `periodFrom`, `periodTo`, and `status`.

The endpoint links parties and sites by their SitePulse IDs first, then by case-insensitive names. It creates only missing records, generates the new site's code and access ID using the existing conventions, and leaves its SMS mobile blank. Repeated order IDs update the saved order and replace its mix lines without creating a second order.

Added nullable SitePulse identity columns and order/line tables using additive schema changes. On a site's access page, each order line shows its ordered, received, and remaining quantity. Received quantity includes matching-mix dispatches marked arrived or unloaded within the order period.

Truck create, edit, and cancel behavior, challan numbering, notifications, and SMS were not changed.

## Safety

- Tests used mocked storage; no real party, site, order, or dispatch records were created or changed.
- Only the development database received the additive schema DDL; no production data or schema was changed.
- No secret values were accessed or included in code or this report.
- The application was not published.

## Verification

- `npm run test:sitepulse` — 19 passed, including order create, update, close, name matching without duplicates, received quantity, and shared-key checks. Existing SitePulse truck tests passed.
- `npm run test:alerts` — 7 passed.
- `npm run build` — succeeded.
- `npm run check` — reports 41 existing TypeScript errors in other areas of the project; none reference the new order module, schema, or tests.
