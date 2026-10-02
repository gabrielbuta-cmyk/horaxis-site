# Support relay — live support chat that works behind a customer's firewall (2026-10-01)

## Why
The old live chat delivered Horaxis's replies by having the **admin's browser POST to
the customer's server** (`callback_url`). A customer's server sits behind its firewall,
so replies never arrived; and the shared `SUPPORT_JWT_SECRET` shipped blank, so tickets
never left an installation either. The relay turns it round: **the installation only
makes outbound HTTPS calls to horaxis.com**, which every firewall allows, and it
identifies itself with its signed licence — nothing per-customer to distribute.

## Rules
- Only when the customer's administrator switched **Live support chat** on (off by default).
- Only outbound calls from the installation; horaxis.com never calls in.
- Polling only while at least one ticket is open (not `resolved`/`closed`), every 60 s.
- The licence is sent in the JSON body over TLS, never in a URL.

## Endpoint
`POST https://horaxis.com/api/support-relay` — JSON body, always with `licence` (the full
signed licence, as installed) and `action`. The licence is verified with the product's
public key (Horaxis or RiskGuard), must be unexpired and not blocked
(`block:cust:` / `block:lic:` — same list as Axis). The **owner** of a ticket is
`product + ":" + lowercased customer` from the licence, so a renewed licence keeps access
to its tickets.

### `upsert_ticket` — a new ticket, or its current state
```json
{ "licence": "...", "action": "upsert_ticket",
  "ticket": { "id": "<uuid, the installation's own ticket id>", "subject": "...",
              "description": "...", "category": "bug|question|...", "priority": "low|medium|high|critical",
              "status": "open|in_progress|waiting_on_customer|resolved|closed",
              "created_at": "<ISO>", "app_version": "1.0.0", "support_tier": "included" } }
```
→ `200 {"ok": true}`. Re-sending the same id updates subject/description/status only.
Refused with `403` if the id already belongs to another owner.

### `comment` — a message from the customer
```json
{ "licence": "...", "action": "comment", "ticket_id": "<uuid>",
  "comment": { "id": "<uuid, the installation's comment id>", "author_name": "...",
               "message": "...", "created_at": "<ISO>" } }
```
→ `200 {"ok": true}`; idempotent on `comment.id`.

### `status` — the customer changed the status (e.g. closed it)
```json
{ "licence": "...", "action": "status", "ticket_id": "<uuid>", "status": "closed" }
```

### `poll` — replies from Horaxis since a cursor
```json
{ "licence": "...", "action": "poll", "since": "<cursor from the last poll, or null>" }
```
→ `200 {"replies": [ { "reply_id": "<id>", "ticket_id": "<uuid>", "message": "...",
                       "author_name": "Horaxis Support", "created_at": "<ISO>",
                       "new_status": "<status or null>" } ], "cursor": "<opaque>" }`

The installation stores each reply as a support-side comment, **deduplicated by
`reply_id`** (store it on the comment), applies `new_status` if present, and keeps the
returned `cursor` for the next poll. Replies older than 30 days are no longer returned.

### Errors
`400` bad body · `401` licence invalid/expired · `403` blocked, or not the ticket's owner
· `429` too many calls (more than 120 per hour per owner). `poll` is not counted: the
counter is a KV write, and polling every minute would use up the daily write quota.

## Horaxis side (support admin page)
Replies typed on horaxis.com/admin for a relay ticket are stored on the ticket and in the
owner's reply log; the admin page no longer tries to reach the customer's server.
