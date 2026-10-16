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
  already running. Each server card shows its latest run (result, time taken, what it did).
- DogeSMS has no bulk price endpoint: prices are read one country at a time
  (`GET /v1/catalog/prices?country_code=`), and its answers are slow (1 to 11 seconds each in
  production; the 130 KB service list can take several seconds). A sync keeps eight country requests in flight at a
  time (a rolling set, so one slow answer holds up only its own slot), drops to one at a time after a 429, waits as DogeSMS asks (Retry-After, else exponential
  back-off), gives each request up to 20 seconds (cut short at the sync's deadline), and stops
  reading after about 44 seconds so the request ends inside Vercel's 60-second limit. Never-synced
  countries go first (the best-known ones before the rest), then those synced longest ago, so
  repeated syncs cover every country. A run that could not read every country is reported as
  partial; the countries it did not read keep their last synced prices. Expect a first full
  coverage to take a few presses of Sync now (or a few daily runs).
- DogeSMS's service and country lists are saved in the settings table (`dogesms_catalog_v1`) and
  reused for six hours, so a sync does not depend on those slow calls every time; if DogeSMS cannot
  answer them, a copy up to a week old keeps the sync going (prices are always read fresh).
- The sync remembers when each country was last read (`provider_country_reads_dogesms` in the settings
  table), including countries with nothing on sale, which have no stored rows to infer a date from.
  A sync counts as **successful** once every country has been read within the last 24 hours, in this
  run or earlier ones; the admin buttons carry on by themselves, pass after pass (up to 10), until
  that is true or a pass reads nothing.
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
- After a customer picks a service and a country, the buy panel shows **Server I** and **Server II**
  with each one's price (the cheaper is marked "Lowest price"; cheapest is selected by default). The
  customer's choice is sent as "I" or "II", mapped to a provider on the server
  (`src/lib/provider/customer-servers.ts`), re-quoted live at that server's own price, and bought only
  there: if that server cannot sell, the customer is told so and can pick the other. Only servers that
  can sell the pair at that moment are offered. The country list is strictly alphabetical, a country's
  "(2)" listings right after the plain one.
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
