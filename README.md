# PayPal Concierge

**An AI shopping agent that can pay with PayPal, but only inside rules you set.**

**Live demo:** https://paypal-concierge.onrender.com/concierge
(Hosted on Render's free tier: the first visit after a quiet spell can take up to a minute while the server wakes up.)

What it does:

- You ask for something in plain English ("a gift under $50 for my brother who likes cricket").
- The agent searches real products from online stores, picks one and explains why.
- A rules engine on the server checks the pick: spend limit, confirm before paying, blocked categories. Every rule result is shown in a "Why" panel.
- If every rule passes and you confirm, you pay with PayPal (sandbox). If any rule fails, the purchase is blocked and no PayPal order is ever created.
- Every order, paid or blocked, appears on an AG Studio dashboard with spending, orders and blocked purchases.

Built for the [Build What's Next with PayPal and AI](https://paypalaihackathon.devpost.com) hackathon.

## How it works

```
Your request
   │
   ▼
Channel3 product search ──► Gemini picks one product and explains why
   │
   ▼
Server looks up the real price and category itself, then checks the rules
   │                                  │
   │ all rules pass                   │ any rule fails
   ▼                                  ▼
You confirm ──► PayPal sandbox order  "Blocked, no payment possible"
   │                                  (no PayPal order is created)
   ▼                                  │
You approve with a sandbox buyer      │
   │                                  │
   ▼                                  │
Server captures the payment           │
   │                                  │
   ▼                                  ▼
Dashboard: spending, orders, blocked purchases
```

1. **Request.** The `/concierge` page sends your message to `POST /api/agent`.
2. **Search.** The agent (Gemini) calls a `search_products` tool, which queries the Channel3 API.
3. **Pick.** Gemini chooses one product and calls `propose_purchase` with only its product id.
4. **Price and rules.** The server takes the price and category from its own copy of the Channel3 result (never from the browser or the AI), saves a draft, and runs the rules in [`lib/rules.ts`](lib/rules.ts).
5. **Order.** If you tick "confirm" and click the PayPal button, `POST /api/orders` checks every rule again and only then creates a PayPal sandbox order through the Orders API.
6. **Capture.** You approve in the PayPal sandbox popup; `POST /api/orders/{id}/capture` captures the payment and checks that the captured amount matches the server's price.
7. **Dashboard.** Paid and blocked orders are saved and shown on `/dashboard`, next to seed orders, so the dashboard has history from the start.

## Guardrails

- **The server sets the price.** The amount charged always comes from the server's own Channel3 lookup. The browser only sends a draft id; the AI only sends a product id.
- **Spend limit.** One purchase may cost at most $50.00 USD.
- **Confirm before paying.** You must tick a confirm box before the PayPal button works, and the server checks that too.
- **Blocked categories.** Alcohol, tobacco, weapons, gambling and gift cards are refused. The server matches these from the product's category ([`lib/categories.ts`](lib/categories.ts)); the AI can add a flag but can never remove one.
- **The agent can never pay or set a price.** Its PayPal tools are read-only, and paying always takes your own click in PayPal.
- **Checked twice.** The rules run when the agent proposes the product and again when the order is created. A blocked purchase never reaches PayPal (the API returns 403).

The rules live in `DEFAULT_RULES` in [`lib/config.ts`](lib/config.ts).

## Tools used

| Tool | How this project uses it |
|---|---|
| **PayPal REST Orders API** | The server creates orders (`POST /v2/checkout/orders`) and captures them (`POST /v2/checkout/orders/{id}/capture`) in [`lib/paypal.ts`](lib/paypal.ts), with plain `fetch`. The endpoint pages and dashboard also read products, plans, invoices, transactions and balances. |
| **PayPal JavaScript SDK v6** | The checkout button on `/concierge` ([`app/checkout-test/paypal-checkout.tsx`](app/checkout-test/paypal-checkout.tsx)), loaded from the sandbox SDK URL. |
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | Gives the agent two read-only tools, `get_order` and `list_transactions`, so it can answer questions about order status and recent sandbox transactions. It is configured with `sandbox: true` and cannot create, capture or refund. |
| **Sandbox only** | Every PayPal call goes to `api-m.sandbox.paypal.com`. There is no live mode. |
| **Gemini via the Vercel AI SDK** (`ai`, `@ai-sdk/google`) | The shopping agent in [`lib/agent.ts`](lib/agent.ts): it calls tools to search, propose a purchase and read PayPal data, then gives a short recommendation. The model id is `GEMINI_MODEL` in [`lib/config.ts`](lib/config.ts), with a fallback model if the first one is busy. |
| **Channel3** | Real product search across online stores ([`lib/channel3.ts`](lib/channel3.ts)). Its results are the only source of product prices. |
| **AG Grid** | The orders grid and one grid per PayPal endpoint under [`app/(endpoints)`](app/(endpoints)). |
| **AG Studio** | The `/dashboard` report: total spent, orders, purchases blocked, spend over time, blocked purchases by rule, recent orders. Each data source loads on its own, so one failing PayPal call does not blank the dashboard. Its optional OpenAI assistant is switched off. |
| **Render** | Hosts the live demo, from [`render.yaml`](render.yaml). |
| **Claude Code with the PayPal plugin** | Development tool only: used to write and review the code and to check the PayPal integration. It is not part of the running app. |

## Run it yourself

You need **Node.js 20.9 or later**.

```bash
git clone https://github.com/chintagadaharshini/paypal-concierge.git
cd paypal-concierge
npm install
cp env.example .env.local
# fill in .env.local (see below)
npm run dev
```

Open http://localhost:3000/concierge.

### Environment variables

`.env.local` is git-ignored. **All PayPal credentials must be sandbox credentials**; never use live ones.

| Variable | Required | Where to get it |
|---|---|---|
| `PAYPAL_CLIENT_ID` | Yes | [PayPal Developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox) > Apps & Credentials > **Sandbox** > your REST app > Client ID. |
| `PAYPAL_SECRET` | Yes | Same sandbox app > Secret. For the transactions and balances pages, also enable the app's **Transaction search** feature. |
| `CHANNEL3_API_KEY` | Yes | Free account at [trychannel3.com](https://trychannel3.com). |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). |
| `AG_STUDIO` | No | AG Studio licence key. The dashboard works without one. |
| `AG_STUDIO_OPENAI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODELS` | No, leave blank | Only for the AG Studio OpenAI assistant, which this project keeps switched off. |

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

### Deploy to Render

1. In Render, choose **New > Blueprint** and connect your copy of this repository.
2. Enter `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` (sandbox), `CHANNEL3_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` when asked. `AG_STUDIO` is optional.
3. Click **Apply**, then open `<your-service>.onrender.com/concierge`.

## Demo script

You need a **sandbox buyer** to pay: create a sandbox personal account in the PayPal Developer dashboard (**Testing Tools > Sandbox Accounts**), and log in with it in the PayPal popup.

On `/concierge`, click each example (or type it):

1. **Allowed:** "A gift under $50 for my brother who likes cricket"
   The agent picks a cricket item under $50 and every rule passes except confirmation. Tick **confirm**, click the PayPal button, log in with your sandbox buyer and approve. The server captures the payment and the page marks it **Paid**.
2. **Blocked by the spend limit:** "The Kookaburra Kahuna Pro 5.0 cricket bat"
   The agent finds the bat at about $172. The Why panel shows the spend limit failing, and a red **"Blocked, no payment possible"** box replaces the PayPal button.
3. **Blocked by category:** "The Trademark Games 10-inch roulette wheel for a casino night"
   The wheel costs about $31, so it is within the limit, but the server matches it to the blocked **gambling** category, and the purchase is blocked.
4. Open **`/dashboard`**: your paid and blocked orders appear next to the seed orders, with spending and blocked purchases by rule.

Prices come live from Channel3, so they can change slightly over time.

## Known limitations

- **Free-tier Gemini can be slow or busy.** A run usually takes 10 to 20 seconds. If Gemini is overloaded the agent retries once on a fallback model, and may then ask you to try again. The demo also limits each visitor to 5 runs per 10 minutes.
- **Orders are kept in memory.** A restart or redeploy clears live orders and goes back to the seed orders.
- **Sandbox only.** No real money moves, and there is no live mode.
- **No webhook.** The optional PayPal webhook for order status updates is not included; order status comes from the capture call.

## Project layout

```
app/concierge/        The main demo page
app/api/agent/        POST: runs the shopping agent
app/api/orders/       POST: create a PayPal order (rules checked again); POST {id}/capture
app/api/rules/check/  GET: preview the rule results for an item
app/dashboard/        The AG Studio dashboard
app/(endpoints)/      One AG Grid page per PayPal endpoint, plus the orders grid
lib/agent.ts          Gemini agent and its tools
lib/rules.ts          The spending rules (pure functions)
lib/categories.ts     Blocked-category matching
lib/channel3.ts       Channel3 search client and server-side product cache
lib/paypal.ts         PayPal REST calls (OAuth, orders, capture, reporting)
lib/orders-store.ts   In-memory order store with seed data
```

## Acknowledgements

Built on PayPal's official AG Grid + PayPal starter, [paypaldev/hackathon-paypal-ag-grid-boilerplate](https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate), which provides the Next.js app, the PayPal REST client, the AG Grid endpoint pages and the AG Studio dashboard that this project extends.

## License

[MIT](LICENSE) © 2026 Rakesh and Harshini Chintagada
