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

## How an order is filled

- The customer's price is the cheapest server's price (the figure the country list shows). Whoever fills
  the order, the price does not change; a server is used only at that price and only at a profit.
- Smart Pickup orders the servers for that exact service and country from Xencodes' own finished orders
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
