# Server II (DogeSMS) and Smart Pickup

GrizzlySMS is **Server I**, DogeSMS is **Server II**. Customers only ever see Xencodes: no supplier name, id,
error or routing detail reaches a customer page, API response or browser bundle (enforced by
`tests/provider-privacy.test.ts`).

## Turning Server II on

1. In the DogeSMS dashboard:
   - create an API key (`sk_live_…`);
   - add the webhook URL `https://www.xencodes.com/api/webhooks/dogesms` and copy its signing secret.
     DogeSMS reports numbers and codes by webhook (status queries are off by default), so Server II
     cannot work without it.
2. In Vercel → Settings → Environment Variables (Production, Sensitive):
   - `DOGESMS_API_KEY`
   - `DOGESMS_WEBHOOK_SECRET`
   - optional `DOGESMS_ALLOCATION_WAIT_SECONDS` (3–45, default 15): how long a purchase waits for a
     number before cancelling that order and trying Server I.
3. Redeploy, then in Admin → Providers: **Test connection** on Server II, **Sync now**, then enable it.

## Syncing (Sync now, Sync all, daily schedule)

- Sync all runs every enabled server side by side, each with its own lock (a second sync of the same
  server is refused while one runs), and reports each server separately: success, partial, failed or
  already running. Every run is kept in Admin → Providers → Sync history (start, duration, result).
- DogeSMS has no bulk price endpoint: prices are read one country at a time
  (`GET /v1/catalog/prices?country_code=`), and it rate-limits those reads (HTTP 429). A sync reads
  three countries at a time, drops to one at a time after a 429, waits as DogeSMS asks (Retry-After,
  else exponential back-off) and stops after about 38 seconds so the request ends inside Vercel's
  60-second limit. Countries refreshed longest ago go first, so repeated syncs cover them all; a run
  that could not read every country is reported as partial, and the countries it did not read keep
  their last synced prices.
- A failed read changes nothing. A whole-catalog answer less than half the size of the last good one
  writes what came back but removes nothing. Only rows for countries a run actually read can be
  removed, and only for this server.
- Customer pages, the homepage and the admin services page read Server II's catalog from the synced
  table, never live per country; only a live quote (one request for one country) asks DogeSMS.
- Sync never writes a selling price: customer prices are worked out from the synced cost at the
  moment they are shown, by the pricing engine, and re-quoted live before every purchase.

## How an order is filled

- Each server is priced its own way. Server I follows the platform price rules (multipliers, minimums,
  repeat-listing and fixed pair prices). Server II sells at **3.5× its own cost** in every currency
  (`PROVIDER_COST_MULTIPLIERS` in `src/lib/pricing.ts`): the cost is converted at the market Naira rate,
  the same rate a Naira price is shown at in dollars, so a dollar wallet sees 3.5× too. Rounded up only
  to ₦1 or 1 cent. The owner's minimums (₦500, TikTok ₦750, UK ₦1,000) still apply on top.
- The country list and the quote show the cheapest server for each country. That server is asked first;
  another server is used only at a price the customer agreed to. A dearer one is never bought silently:
  the customer is shown its price to confirm.
- When a Server I order ends without a code (expired, refunded or cancelled), the order screen offers
  "Didn't get a code? Try Server II" with Server II's price for the same service and country, bought in
  one tap (`getServerTwoOfferAction` / `buyOnServerTwoAction`). Shown only when Server II can sell it.
- Between servers at the same price, Smart Pickup orders the servers for that exact service and country from Xencodes' own finished orders
  (delivery rate shrunk toward the server's record for the same service and the same country, marked down
  for small samples), plus purchase reliability, speed to code and margin, with admin-set weights
  (Admin → Providers → Smart Pickup). A server failing too many recent requests is set aside.
- With too little history for a pair, the default server goes first and a small share (default 10%)
  goes to the other so evidence is collected.
- Fallback: the next server is asked only when the previous one **definitely** sold nothing (no
  numbers, refused, not connected, or a DogeSMS order with no number in time that was cancelled
  successfully). A timeout after a request was sent stops the purchase: the customer is not charged,
  no second number is bought, and the request is listed under "Purchases to review".
- DogeSMS orders carry an `X-Idempotency-Key`; a lost answer is re-asked with the same key, so a retry
  can never create a second order.

## Limitations to confirm with one real DogeSMS order

The DogeSMS documentation could only be read in excerpts from this environment. Confirmed: base URL,
Bearer auth, catalog endpoints, `POST /v1/orders` with `X-Idempotency-Key` and `max_price_cents`, the
order states, cancel, the four webhook events and the `X-Webhook-Signature: sha256=…` HMAC. Not visible:
the exact JSON field names of the order and price responses, which are read tolerantly
(`id`/`order_id`, `price_cents`, `phone_number`, `count`/`stock`). If DogeSMS answers with other names,
the adapter refuses rather than guesses; check the Vercel logs (`[dogesms]`) after the first order.
- Session length: DogeSMS's countdown is "5–20 minutes by channel"; Xencodes holds an order for 20
  minutes unless DogeSMS sends `expires_at`, and ends it earlier on `order.expired`.
- Purchase retry limit (8 requests) and request timeouts (12s DogeSMS, GrizzlySMS's own) are in code.
