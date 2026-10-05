# The Time Souk Auctions

The weekly live watch auction for **The Time Souk**, Dubai: a bilingual (English / Arabic) website with pre-bidding, a live sale run alongside Instagram, a staff console, winners' invoices and payments.

**Setting it up? Follow [docs/SETUP.md](docs/SETUP.md).** It's written click by click.

## How the sale works

- A new auction (Auction Nº 01, 02, …) every Saturday, live from 4 pm Dubai time, up to 100 lots.
- Registered bidders (email code + phone code, terms accepted) can bid and set maximum bids from the moment pre-bids open.
- On the day, staff put each lot **on the block** from the console; the website shows it big. Staff press **Start** when the Instagram timer starts: a timer (3 minutes by default; change it in Settings, per auction, or per lot from the console), sudden death, no extensions.
- Instagram, WhatsApp and phone bids are typed into the console; website bids arrive by themselves. When the reserve is met the lot shows **Pure sale**.
- No buyer's premium: the winner pays the hammer price. Consignors pay a seller fee (7.5% by default, can be changed per lot).
- Winners get a payment link by email and WhatsApp and pay within 3 working days by card (Ziina), Tabby, Tamara or bank transfer. A reminder goes out the day before the due date.
- Unsold lots are never carried forward automatically; staff relist them by hand.

## Stack

| Part | What |
|---|---|
| Website and API | Next.js 15 (App Router, React 19, TypeScript) on **Vercel Pro** (an every-minute cron closes lots and sends payment links) |
| Database, auth, live updates, photos | **Supabase**: Postgres with row-level security, email OTP, Realtime, Storage |
| Bidding engine | PL/pgSQL in `supabase/migrations/`: row-locked, server-timed, maximum bids resolved in one pass |
| Email | Resend |
| Phone codes and WhatsApp | Twilio Verify and WhatsApp Content templates |
| Payments | Ziina (card links), Tabby, Tamara, bank transfer |

## Project layout

```
app/(site)/[locale]/   public site in /en and /ar (home, catalogue, lot pages, live, register, account, pay, results, sell, terms, privacy)
app/(admin)/admin/     staff admin (live console, auctions, lots, bidders, payments, consignments, settings)
public/brand/          the logo (site, emails); app/icon.png and the link-preview image are made from it
app/api/               phone codes, payments, provider webhooks, cron, uploads, CSV export
components/            site, live bidding and admin components
lib/                   formatting, auction rules, i18n (EN/AR), Supabase clients, invoices, notifications, payment providers
supabase/migrations/   the database: tables, security rules and bidding engine (run 0001, then 0002, then 0003)
supabase/tests/        bidding-engine tests on an in-memory Postgres
docs/SETUP.md          deployment and run-of-show guide
```

## Run it on a computer

Requires Node 22.

```bash
npm install
npm run dev          # http://localhost:3000
```

With no Supabase settings the site runs in **preview mode** with 24 sample watches, so you can click around safely. Set `DEMO_LIVE=1` to see a lot live on the block, or `DEMO_LIVE=block` to see it waiting for Start. To connect real services, copy `.env.example` to `.env.local` and fill it in (never commit it).

## Checks

```bash
npm run typecheck    # TypeScript
npm run test:db      # 34 bidding-engine tests: any-amount bids, maximum bids, ties, reserve, sudden death, timers, invoices, cash on delivery, addresses, privacy rules
npm run build        # production build
```

## Before launch

- The Terms of Sale and Privacy Policy are drafts: have them reviewed by a UAE lawyer.
- Have a native speaker review the Arabic.
- Confirm licensing, VAT treatment of the seller fee, and any AML/ID-check obligations with your advisers.
