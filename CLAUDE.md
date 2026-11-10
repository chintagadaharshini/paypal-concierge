@AGENTS.md
# PayPal Concierge: PayPal AI Hackathon project
## Goal
Win the "Build What's Next with PayPal and AI" hackathon (Devpost).
Deadline: 12 Nov 2026, 12:00 PM Pacific (1:30 AM IST on 13 Nov). Prize targets:
Best Use of Agentic Commerce, Best Use of PayPal + AI, Best Use of AG Grid,
Best Demo Delivery.
## What we are building
An AI shopping agent that can pay, but only within user-set rules.
Flow:
1. User types a request ("gift under $50 for my brother who likes cricket").
2. Agent searches products with the Channel3 API.
3. Agent picks the best option and explains why.
4. A rules engine checks it (spend limit, must-confirm-before-paying, blocked
   categories). Rule results appear in a "why" panel.
5. The server creates a PayPal SANDBOX order; the user approves it with a
   sandbox buyer; the server captures it.
6. Orders are saved and shown on the AG Studio dashboard (/dashboard) as a
   new data source: spending, orders, AI-flagged items.
7. A PayPal webhook updates order status (build this after the app is deployed
   to Render, because webhooks need a public URL).
The demo must include one payment the guardrails BLOCK.

## Starting point (already in this repo)
A Next.js app with AG Grid pages under app/(endpoints), an AG Studio dashboard
under app/dashboard, and PayPal REST calls in lib/paypal.ts. Reuse these. Add to
them; do not rewrite them. Read AGENTS.md first: this Next.js version has
breaking changes, so read the docs in node_modules/next/dist/docs/ before coding.

## Tech
- Backend: Next.js route handlers under app/api (no separate Express server).
- AI: Gemini via the Vercel AI SDK (@ai-sdk/google). Key: GOOGLE_GENERATIVE_AI_API_KEY.
  Model name in ONE config constant; confirm the current free-tier model id
  (e.g. a Gemini Flash model) from Google's docs before using it.
- PayPal: @paypal/agent-toolkit so the agent can call PayPal tools, plus the
  existing lib/paypal.ts for REST. Verify exact imports and usage against
  https://developer.paypal.com/ai-tools/toolkit.md before writing code.
  Checkout buttons: PayPal JavaScript SDK v6.
- Products: Channel3 API (must be genuinely called). Key: CHANNEL3_API_KEY.
- Dashboard: AG Studio. Leave the starter's OpenAI assistant switched off.
- Storage: keep it simple (a small JSON file or in-memory store with seed data).
  Seed some demo orders so the dashboard looks alive.
- Deploy: Render.

## Hard rules
- SANDBOX ONLY. Never use live PayPal credentials or the production endpoint.
- Env var for the PayPal secret is PAYPAL_SECRET (not PAYPAL_CLIENT_SECRET).
  Secrets live in .env.local only. Never print, log, or commit keys.
  Add any new variables to env.example with blank values.
- The SERVER calculates and verifies every amount. Never trust the browser or
  the AI for the final price.
- Verify PayPal webhook signatures.
- One failing PayPal call must not blank the whole dashboard (use per-source
  error handling).
- Use the paypal-best-practices skill, and run /paypal:doctor on PayPal code
  before calling it done.
- Keep it simple: one flawless main flow beats many half-working features.
- The repo is public and open source: keep a LICENSE file (MIT), and keep the
  README accurate with copy-paste setup and run steps.

## Done means
Judges can open a hosted Render URL, or follow the README, and complete:
search, rule check, sandbox payment, dashboard view, and a blocked payment.