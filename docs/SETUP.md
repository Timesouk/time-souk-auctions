# The Time Souk Auctions: setup guide

This guide takes you from the code on GitHub to a live auction site, one click at a time. Do the steps in order. Plan for about **3 hours of setup**, plus **waiting time** for WhatsApp, Tabby and Tamara approvals (start those today; see Part 0).

> **Golden rule for keys and passwords.** Every key goes straight from the service's dashboard into **Vercel → Settings → Environment Variables** (or into Supabase where this guide says so). Never paste a key into a chat, an email, a WhatsApp message or a file in GitHub. If a key ever leaks, delete it in that service's dashboard and make a new one.

**What you'll set up**

| Service | What it does | Cost (Oct 2026) |
|---|---|---|
| **GitHub** | Stores the code. Every change you push redeploys the site. | Free |
| **Vercel Pro** | Runs the website and the every-minute job that closes lots and sends payment links. **Pro is required**: Hobby is for non-commercial use and only allows a once-a-day job. | $20/month |
| **Supabase** | Database, sign-in codes by email, live updates, lot photos. | Free to start; **Pro $25/month recommended** before launch (free projects pause after a week of inactivity and have no backups) |
| **Resend** | Sends every email (sign-in codes, payment links, receipts). | Free plan is 100 emails/day; **Pro $20/month** (50,000/month) once you have real bidders |
| **Twilio** | Phone codes (WhatsApp or SMS) and WhatsApp payment links. | Pay per message |
| **Ziina** | Card payments by payment link. | Per-transaction fees |
| **Tabby / Tamara** | Pay-later options. | Per-transaction fees |

---

## Part 0 · Start the slow things today

These involve approvals by other companies. Start them now and carry on with the rest while you wait.

1. **WhatsApp sender (Meta approval: hours to 2 weeks).** In Twilio, register the WhatsApp number you'll send from (Part 4, step 1). Meta business verification can take 1 to 2 weeks.
2. **WhatsApp message templates (approval: minutes to 2 days).** Submit them as soon as your sender exists (Part 4, step 4).
3. **Tabby live keys.** For a custom integration like this one, Tabby gives you **test keys first** and issues **live keys after their team tests your checkout**. Email your Tabby account manager (or partner@tabby.ai) now to ask for test keys, your merchant code, and a QA slot.
4. **Tamara sandbox access.** Ask your Tamara contact for **sandbox** access to the Partner Portal, plus the live portal for later.
5. **Ziina.** Nothing to wait for; you'll generate a key in Part 5.

---

## Part 1 · Supabase (database and sign-in)

### 1.1 Create the project
1. Go to **supabase.com → Dashboard → New project**.
2. **Name:** `time-souk-auctions`. **Database password:** click *Generate a password* and save it in your password manager (you won't need it day to day).
3. **Region: South Asia (Mumbai)**. It's the closest Supabase region to Dubai, and the website is already set to run in Mumbai to match. *(If you pick another region, tell whoever maintains the code so they change `regions` in `vercel.json`.)*
4. Leave the security options at their defaults (Data API on, public schema). Click **Create new project** and wait for it to finish (about 2 minutes).

### 1.2 Create the tables and the bidding engine (two files, each run once)
1. On GitHub, open `supabase/migrations/0001_init.sql` in the repository and click the **Copy raw file** button (top-right of the file).
2. In Supabase: **SQL Editor → New query**. Paste. Click **Run**. You should see **Success. No rows returned**.
3. Do the same with `supabase/migrations/0002_timers.sql` (adjustable timers). Run it **after** 0001.
   Then `supabase/migrations/0003_any_amount_cod_address.sql` (bid any amount, cash on delivery, delivery addresses). Run it **after** 0002.
   Then `supabase/migrations/0004_cod_uae_only.sql` (cash on delivery for UAE deliveries only). Run it **after** 0003.
4. Check **Table Editor**: you should see tables such as `auctions`, `lots`, `bids`, `invoices`, `profiles`.

> Run 0001 **only once** per project. If it shows an error, don't run it again on top: copy the error message (not any keys) and send it to whoever maintains the code. 0002, 0003 and 0004 are safe to run again.

### 1.3 Copy the API keys into Vercel later
You'll need these three values in Part 3. Find them in **Project Settings → API Keys** (and **Project Settings → Data API** for the URL):

| Vercel variable | Where in Supabase |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, like `https://abcd1234.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **publishable** key (`sb_publishable_…`), or the legacy **anon** key |
| `SUPABASE_SERVICE_ROLE_KEY` | The **secret** key (`sb_secret_…`), or the legacy **service_role** key. **Keep this one secret.** It can read everything. |

Don't copy them anywhere else; leave this tab open and paste them straight into Vercel in Part 3.

### 1.4 Sign-in by email code
1. **Authentication → Sign In / Providers → Email**: make sure **Email** is enabled and **Allow new users to sign up** is on. Set **Email OTP expiration** to `600` seconds (10 minutes) and leave **Email OTP length** at `6`. Save.
2. **Authentication → URL Configuration**: set **Site URL** to your website address (for now your `…vercel.app` address from Part 3; change it to `https://www.yourdomain.com` when your domain is connected). Add `https://www.yourdomain.com/**` under **Redirect URLs**.
3. **Authentication → Emails → Templates** (do this after Part 2.3: since June 2026 Supabase only lets new free projects edit these once custom SMTP is saved). The site signs people in with a **6-digit code**, not a link, so two templates must show the code. Edit **both "Confirm signup" and "Magic Link"**:
   - **Subject:** `Your Time Souk code · رمز تايم سوق`
   - **Body** (replace everything):

```html
<div style="font-family:Arial,sans-serif;max-width:480px">
  <img src="https://www.yourdomain.com/brand/logo-email.png" width="120" alt="The Time Souk" style="display:block;margin:0 0 16px">
  <p>Your sign-in code is:</p>
  <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:8px 0">{{ .Token }}</p>
  <p style="color:#555">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
  <div dir="rtl" style="text-align:right">
    <p>رمز الدخول الخاص بك:</p>
    <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:8px 0">{{ .Token }}</p>
    <p style="color:#555">ينتهي الرمز خلال 10 دقائق. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.</p>
  </div>
</div>
```

   Replace `www.yourdomain.com` in the first line with your own address so your logo shows at the top.
4. Custom email sending (so codes come from your domain and aren't capped at a few per hour) is set up in **Part 2.3**, after Resend.

### 1.5 Upgrade to Pro before launch (recommended)
**Organization → Billing → Upgrade to Pro.** Free projects pause after a week without activity and have no automatic backups. You don't want either on a Saturday.

---

## Part 2 · Resend (email)

### 2.1 Verify your domain
1. **resend.com → Domains → Add domain** → enter `yourdomain.com` → region **EU (Ireland)** or the default.
2. Resend shows 3 or 4 DNS records (MX and TXT on a `send` subdomain, and a DKIM TXT record). Add them **exactly** at your domain registrar's DNS page. They don't affect your normal company email.
3. Back in Resend, click **Verify**. It can take from a few minutes to a few hours. Wait for **Verified**.

### 2.2 Create an API key (for the website)
**API Keys → Create API key** → name `time-souk-website`, permission **Sending access**, domain **yourdomain.com** → **Add**. Copy it straight into Vercel as `RESEND_API_KEY` (Part 3). Resend shows it only once.

### 2.3 Let Supabase send its sign-in codes through Resend
1. Create a **second** Resend key named `supabase-auth` (same settings).
2. Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: `auctions@yourdomain.com` · Sender name: `The Time Souk`
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend` · Password: *paste the `supabase-auth` key here*
   - **Save**.
3. **Authentication → Rate Limits**: raise **emails sent per hour** to `200` so a busy Saturday of sign-ups isn't throttled. Save.

---

## Part 3 · Vercel (the website)

### 3.1 Upgrade and import
1. **vercel.com → your team → Settings → Billing → upgrade to Pro.** (The every-minute job won't deploy on Hobby.)
2. **Add New… → Project → Import Git Repository**. If `Timesouk/time-souk-auctions` isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to that repository.
3. Framework preset: **Next.js** (detected automatically). Leave the build settings as they are.
4. Click **Deploy**. With no settings yet, the site opens in **preview mode** with sample watches. That's expected and lets you see it immediately.

### 3.2 Add the settings (environment variables)
Go to **Project → Settings → Environment Variables**. For each line below, click **Add**, enter the **Key** and **Value**, tick **Production** and **Preview**, and save. Paste each value directly from the service's dashboard.

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Your address with no slash at the end. For now the `https://….vercel.app` address; later `https://www.yourdomain.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase (Part 1.3) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase (Part 1.3) |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase (Part 1.3). Mark it **Sensitive** |
| `CRON_SECRET` | A random string you make up: use your password manager to generate 40 letters and numbers. Vercel sends it to the every-minute job so nobody else can trigger it |
| `RESEND_API_KEY` | From Resend (Part 2.2) |
| `EMAIL_FROM` | `The Time Souk <auctions@yourdomain.com>` |
| `STAFF_EMAIL` | Where staff alerts go (new consignments, payments). Several addresses: separate with commas |

Twilio and payment keys get added in Parts 4 and 5.

**After adding or changing variables, always redeploy:** **Deployments →** the top deployment's **⋯ → Redeploy**. Settings only take effect on a new deployment.

### 3.3 Connect your domain
1. **Project → Settings → Domains → Add** `www.yourdomain.com`. Accept Vercel's suggestion to redirect `yourdomain.com` to it.
2. Vercel shows the DNS records to add. Add them at your registrar. When both show **Valid Configuration**, you're connected (HTTPS is automatic).
3. Change `NEXT_PUBLIC_SITE_URL` to `https://www.yourdomain.com`, update Supabase's **Site URL** (Part 1.4), then **Redeploy**.

---

## Part 4 · Twilio (phone codes and WhatsApp)

### 4.1 WhatsApp sender
1. **Twilio Console → Messaging → Senders → WhatsApp senders → Create new sender.** Follow the Meta sign-up: connect or create your Meta Business account and register the number you'll send from (a number that is **not** currently used in the WhatsApp app, or migrate it). Set the display name to **The Time Souk**.
2. **Messaging → Services → Create Messaging Service** named `Time Souk WhatsApp`. Add the WhatsApp sender to it. You'll need this service for WhatsApp codes.

### 4.2 Phone codes (Twilio Verify)
1. **Verify → Services → Create new.** Friendly name: `Time Souk` (it appears in the code message). Turn on **SMS**.
2. Open the service → **WhatsApp** tab → choose the `Time Souk WhatsApp` Messaging Service. *(Twilio requires your own sender for WhatsApp codes.)*
3. In Vercel add:

| Key | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | Console home page, **Account SID** (`AC…`) |
| `TWILIO_AUTH_TOKEN` | Console home page, **Auth Token** (Sensitive) |
| `TWILIO_VERIFY_SERVICE_SID` | The Verify service's **Service SID** (`VA…`) |
| `TWILIO_VERIFY_CHANNELS` | Start with `sms`. When WhatsApp codes work in your tests, change it to `whatsapp,sms` (bidders then choose) |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+9715XXXXXXXX` (your sender number) |

> Twilio trial accounts can only message numbers you've verified in the console. **Upgrade the Twilio account** (add a payment method) before inviting real bidders.

### 4.3 Test a code to your own phone
After redeploying, register on your site (Part 6). If the phone code doesn't arrive, see **Troubleshooting**.

### 4.4 WhatsApp payment-link templates
WhatsApp only lets businesses start a conversation with an **approved template**. Create them in **Messaging → Content Template Builder → Create new**: type **Text**, category **Utility**. Rules from Meta: a message can't start or end with a `{{…}}` variable.

The site fills in: `{{1}}` first name · `{{2}}` lot (e.g. *Lot 07 · Rolex Submariner*) · `{{3}}` amount · `{{4}}` due date · `{{5}}` payment link.

**`ts_invoice_en`** (English):
```
Hi {{1}}, congratulations! You won {{2}} at The Time Souk for {{3}} (no buyer's premium). Please pay by {{4}} using this secure link: {{5}} Thank you, The Time Souk.
```

**`ts_reminder_en`** (English):
```
Hi {{1}}, a friendly reminder that payment for {{2}} ({{3}}) is due by {{4}}. Pay securely here: {{5}} Thank you, The Time Souk.
```

**`ts_invoice_ar`** (Arabic, language *Arabic*):
```
مرحباً {{1}}، مبروك! فزت بـ {{2}} في تايم سوق بمبلغ {{3}} (بدون عمولة على المشتري). يرجى الدفع قبل {{4}} عبر هذا الرابط الآمن: {{5}} شكراً لك، تايم سوق.
```

**`ts_reminder_ar`** (Arabic):
```
مرحباً {{1}}، تذكير ودي بأن دفع {{2}} ({{3}}) مستحق قبل {{4}}. ادفع بأمان من هنا: {{5}} شكراً لك، تايم سوق.
```

Give each variable a sample value when asked (e.g. *Ahmed*, *Lot 07 · Rolex Submariner*, *AED 33,000*, *Wednesday 7 October*, *https://www.yourdomain.com/en/pay/abc*). Submit each for **WhatsApp approval**. When approved, copy each template's **Content SID** (`HX…`) into Vercel:

| Key | Template |
|---|---|
| `TWILIO_WA_TEMPLATE_INVOICE` | `ts_invoice_en` |
| `TWILIO_WA_TEMPLATE_REMINDER` | `ts_reminder_en` |
| `TWILIO_WA_TEMPLATE_INVOICE_AR` | `ts_invoice_ar` (optional: Arabic-speaking bidders get this one) |
| `TWILIO_WA_TEMPLATE_REMINDER_AR` | `ts_reminder_ar` (optional) |

Redeploy. If Meta re-categorises a template as *Marketing*, it still works; it just costs a little more per message.

---

## Part 5 · Payments (start in test mode)

Set everything up in **test/sandbox mode** first. No real money moves until you flip the switches in Part 9.

### 5.1 Ziina (card payment links)
1. Go to **ziina.com/business/connect**, choose **Other builder or custom**, confirm with your phone and email, and generate an access token.
2. In Vercel add:

| Key | Value |
|---|---|
| `ZIINA_API_KEY` | The token (Sensitive) |
| `ZIINA_WEBHOOK_SECRET` | A random string you make up (password manager, 40 characters) |
| `ZIINA_TEST_MODE` | `true` |

### 5.2 Tabby
From your Tabby account manager (Part 0) you'll have **test keys** (`pk_test_…` / `sk_test_…`) and a **merchant code**. Add to Vercel:

| Key | Value |
|---|---|
| `TABBY_SECRET_KEY` | The **secret** test key `sk_test_…` (Sensitive) |
| `TABBY_MERCHANT_CODE` | Your merchant code |
| `TABBY_WEBHOOK_SECRET` | A random string you make up |

### 5.3 Tamara
From the **sandbox** Partner Portal, copy the **API token** and the **notification token**. Add to Vercel:

| Key | Value |
|---|---|
| `TAMARA_API_URL` | `https://api-sandbox.tamara.co` |
| `TAMARA_API_TOKEN` | The API token (Sensitive) |
| `TAMARA_NOTIFICATION_TOKEN` | The notification token (Sensitive) |

Then in the Tamara Partner Portal: **Settings → General Settings → Webhooks → Add webhooks**. URL `https://www.yourdomain.com/api/webhooks/tamara`; events **order_approved**, **order_authorised**, **order_captured**.

### 5.4 Register Ziina and Tabby webhooks
**Redeploy**, then follow Part 7 to reach the admin and press **Register payment webhooks** (Admin → Settings). It tells you whether Ziina and Tabby accepted the address.

> **Note on pay-later limits.** Tabby and Tamara approve each shopper up to their own limit. For expensive watches the buyer may be offered a lower amount or declined; card and bank transfer always remain available on the payment page.

---

## Part 6 · Make yourself the admin

1. Open your site and click **Register**. Enter your email, type the 6-digit code from your inbox, fill in your details, then confirm your phone with the code. You get a paddle number (the first one is 101).
2. In Supabase: **SQL Editor → New query**, paste this with your own email, and **Run**:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@yourdomain.com';
   ```
3. Go to `https://www.yourdomain.com/admin`. You're in.

**Adding staff:** ask each staff member to register on the site, then **Admin → Bidders →** find them **→ Role → staff**. Staff can run the live console and manage lots; only admins change roles.

---

## Part 7 · Admin settings

**Admin → Settings**:

1. **Auction rules and contact.** Seller fee `7.5`, working days to pay `3`, weekly lot target `100`, the WhatsApp number and Instagram handle shown to bidders, contact email, and your **bank transfer details** (only shown on winners' payment pages). Save.
2. **Default timer per lot.** Pick from the list (30 seconds to 10 minutes) or **Other length…** and type minutes and seconds (10 seconds to 60 minutes). Every auction uses it unless you set a different timer on that auction (Part 8). Save.
3. **Connections.** Every line should show ✓. A ✗ names the missing Vercel variable. Add it in Vercel, then redeploy.
4. Press **Send test email**. It should arrive in your inbox within a minute, with your logo at the top.
5. Press **Register payment webhooks** (Part 5.4).

---

## Part 8 · Your first auction

1. **Admin → Auctions → New auction.** Number `1`, the auction date, live start `16:00` (Dubai time), when pre-bids open (for example Monday 10:00), and the timer per lot (leave **Default** to use the one in Settings). It's created as a **draft** (hidden from the website).
   - **To change the date, time or timer later** (even after publishing): open the auction; the **Date, time and timer** card is at the top. Change the auction date (any day; it warns you if it isn't a Saturday), live start, pre-bid opening or timer, then **Save changes**. The website, including the home-page countdown, updates straight away. The live console links here too (**Change date, time or timer**).
   - **Which timer a lot runs for:** the lot's own timer if you changed it in the live console, otherwise the auction's timer, otherwise the default in Settings.
2. **Add lots.** Two ways:
   - **Paste from Excel or Google Sheets:** on the auction page, **Paste lots from Excel → Copy header row**, and paste it into row 1 of a new sheet. The columns are:
     `Brand, Model, Ref, Year, Size mm, Case, Dial, Dial colour, Bezel, Shape, Hands, Bracelet, Box, Papers, Condition, Est low, Est high, Start bid, No reserve, Reserve, Source, Cost, Consignor, Consignor phone, Seller fee %, Photo link, Notes`.
     Fill one row per watch (Brand and Model are required; leave Start bid empty to use about 70% of the low estimate). Select the rows **including the header**, copy, paste into the box, check the summary under it, then press the import button.
   - **One at a time:** **Add a lot** on the auction page.
   - **From a consignment request:** **Admin → Consignments → Create lot** copies the seller's details into a new lot.
3. **Photos.** Open each lot and drag photos onto the drop area. The first photo is the cover; use ← → to reorder. Photos are resized automatically. Until a lot has photos, the site shows a drawing of the watch.
4. **Reserves.** Set a reserve on every lot, or tick **No reserve**. The live console warns **NOT SET** for any lot without one. Reserves, costs and consignor details are never shown on the website.
5. When the catalogue is ready, press **Publish to the website**. Registered bidders can then place bids and maximum bids from the pre-bid opening time until each lot's timer ends on Saturday.

**Relisting unsold lots:** nothing carries over automatically. On next week's auction page, the **Unsold from earlier auctions** panel lists them: tick the ones the owners want offered again and press **Add to this auction**. Reserves and seller details come with them; old bids don't.

---

## Part 9 · Rehearse, then go live

### 9.1 Rehearsal (test mode, about 45 minutes)
Use a separate test auction, number **99**, with 3 or 4 lots. Do it with a colleague on a second phone.

- [ ] A new bidder registers: email code arrives, phone code arrives (SMS, then WhatsApp if enabled).
- [ ] Pre-bid: place a normal bid and a maximum bid from the phone; a second account outbids it; the maximum bid answers automatically.
- [ ] Change the auction's live start time and check the home-page countdown moves.
- [ ] **Admin → Live:** put lot 1 on the block. The website shows it big within a second or two.
- [ ] Change **Timer for this lot** to 1:00 and check the website shows 1:00.
- [ ] **Start timer.** Both screens count down together; the website timer turns red for the last 30 seconds.
- [ ] Record an "Instagram" bid in the console (amount + `@handle`); it appears on the website.
- [ ] A website bid lands while the timer runs; it appears in the console.
- [ ] When the bid reaches the reserve, the site shows **Pure sale**.
- [ ] At 0:00 the lot closes on its own. A bid after 0:00 is refused.
- [ ] Nothing is sent yet. Press **Send invoice** (tap twice): the winner gets the payment link by **email and WhatsApp**.
- [ ] On the payment page, type a delivery address, keep the country as **United Arab Emirates** and choose **Cash on delivery**: the total goes up by the cash on delivery charge (AED 10 by default, **Admin → Settings**). Change the country to Oman: **Cash on delivery** greys out.
- [ ] Pay one test invoice each way: **Ziina** test card, **Tabby** test account, **Tamara** sandbox, and **bank transfer** (mark it paid in **Admin → Payments**). Each shows **Paid** and the buyer gets a receipt.
- [ ] **Reopen:** close a lot, reopen it, record a missed bid, **Hammer now**, then **Send invoice**: it goes to the new winner.
- [ ] Afterwards: **Unpublish** auction 99 so it's hidden, and **Cancel** its test invoices in **Admin → Payments**.

### 9.2 Go-live switches
Change these in Vercel, then **Redeploy**:

- [ ] `ZIINA_TEST_MODE` → `false`
- [ ] `TABBY_SECRET_KEY` → your **live** secret key (after Tabby's QA), then press **Register payment webhooks** again
- [ ] `TAMARA_API_URL` → `https://api.tamara.co`, `TAMARA_API_TOKEN` and `TAMARA_NOTIFICATION_TOKEN` → **live** tokens; add the webhook in the **live** Tamara portal too (Part 5.3)
- [ ] Twilio account upgraded; both WhatsApp templates approved
- [ ] Supabase and Resend on paid plans
- [ ] Terms and privacy pages reviewed by your lawyer (see Part 12)

---

## Part 10 · Saturday run of show

**Pace.** The sale length depends on the timer. For 100 lots, with about 45 seconds between lots, starting at 4:00 pm:

| Timer per lot | Sale length | Ends around |
|---|---|---|
| 1:00 | 2 h 55 min | 6:55 pm |
| 1:30 | 3 h 45 min | 7:45 pm |
| 2:00 | 4 h 35 min | 8:35 pm |
| 3:00 | 6 h 15 min | 10:15 pm |

**Morning**
- Admin → Settings: all connections ✓.
- Check every lot has photos and a reserve (or "No reserve").

**3:30 pm**
- A staff member opens **Admin → Live** on a laptop (keep it plugged in, on reliable internet).
- A second screen shows the public **/en/live** page so you see what bidders see.

**Each lot**
1. Press **Put lot 01 on the block** (later: **Next: lot 02**). The website shows it big.
2. Optional: change **Timer for this lot** under the yellow timer (pick a length, or **Other length…** then **Set**). The website shows the new length straight away. **Use [length] for all remaining lots** applies it to every lot still to come.
3. Present the watch on Instagram live.
4. **The moment you start the timer on Instagram, the staff member presses Start timer.**
5. While it runs, staff type every Instagram, WhatsApp or phone bid into **Record a bid** (amount plus `@instagram` or paddle number). Website bids appear by themselves.
6. When the site shows **Pure sale**, announce it on the live. To sell regardless of the reserve, press **Make pure sale**.
7. At **0:00** the lot closes. It's sudden death: a running timer can't be lengthened or shortened.
   - If an Instagram bid arrived **before 0:00** but wasn't typed in time: **Reopen lot → record the bid → Hammer now**.
   - **Restart timer** starts the lot's full timer again (use it if the Instagram timer and the site went out of step).
8. **Nothing goes to the winner on its own.** When you're sure no bid was missed, press **Send invoice** (tap it twice). Or press **Next** and send it later: every sold lot waits in **Sold · invoice not sent yet** on the right of the console (and in **Winners & payments**), with **Send all** for the end of the sale.
9. Press **Next**.

Bidders can bid **any amount** above the current bid (the quick buttons and max bids still use the usual steps). In **Record a bid** you can also type any amount above the current bid.

**After the sale**
- Send any invoices still waiting: **Live console → Sold · invoice not sent yet → Send all**, or one by one in **Winners & payments**.
- **Instagram winners without an account:** in **Admin → Payments**, the invoice shows their `@handle`. Use **Copy pay link** to send it yourself, or once they register, enter their paddle number and press **Link & send payment link**.
- The day before each invoice is due, a reminder goes out automatically (between 10 am and 8 pm Dubai time). **Resend email & WhatsApp** sends the link again at any time.
- **Bank transfers:** when the money arrives, find the invoice → choose **Bank transfer** → **Mark paid**. The buyer gets a receipt.
- **Cash on delivery (UAE deliveries only):** the invoice shows *Cash on delivery · collect AED …* and the delivery address, and you get an email. Deliver, collect the cash, then choose **Cash on delivery** → **Mark paid**. Cash on delivery invoices never show as overdue and get no reminder.
- **Consignors:** each consigned lot shows the seller fee and what you owe the consignor. Press **Mark consignor paid** when you've paid them.
- **Admin → Payments → Download CSV** gives your accountant every sale.

---

## Part 11 · Troubleshooting

| Problem | Fix |
|---|---|
| Site still shows sample watches | Supabase variables missing, or you didn't redeploy after adding them. |
| Site shows an error after connecting Supabase | Check all four database files ran: `0001_init.sql`, `0002_timers.sql`, `0003_any_amount_cod_address.sql`, then `0004_cod_uae_only.sql` (Part 1.2). |
| Can't change the timer on a lot | Its timer is running. Sudden death: stop it, or let it end and Reopen. |
| No email code | Check Resend → **Logs**. Check Supabase SMTP settings (Part 2.3), and that the templates contain `{{ .Token }}`. Look in spam. |
| Email code says "invalid" | Codes expire after 10 minutes and only the newest code works. Ask for a new one. |
| No phone code by WhatsApp | Set `TWILIO_VERIFY_CHANNELS=sms` and redeploy, then check the Verify service's WhatsApp tab has your Messaging Service. Twilio trial accounts only reach verified numbers. |
| No WhatsApp payment link | **Admin → Payments** shows the error on the invoice. Usually a template that isn't approved yet or a wrong `HX…` SID. Press **Resend email & WhatsApp** after fixing. |
| Lots don't close / links not sent | Vercel → Project → **Settings → Cron Jobs** should list `/api/cron/tick` running every minute. Needs Vercel Pro and `CRON_SECRET`. |
| A payment says "processing" for long | Open the invoice: the site re-checks with the provider when the buyer returns and on each webhook. Press **Register payment webhooks** again if needed. |
| Website timer seems off | The site syncs to the server clock. Check the laptop running the console has internet; refresh the page. |
| Someone can't bid | **Admin → Bidders**: check email confirmed, phone verified, terms accepted, not suspended. |

---

## Part 12 · Before you launch publicly

- **Terms and privacy.** The site includes draft Terms of Sale and a Privacy Policy in English and Arabic. Have a UAE lawyer review them, especially: no buyer's premium, the 3-working-day payment rule, what happens if a winner doesn't pay, the seller fee, and data handling (your database is hosted in Mumbai).
- **Arabic copy.** Have a native speaker read the whole site in Arabic.
- **Licensing.** Confirm with Dubai Economy and Tourism that your trade license covers running auctions (online and on Instagram).
- **VAT and AML.** Ask your accountant how VAT applies to the seller fee and to own-stock sales, and your compliance adviser whether ID checks or reporting rules apply to high-value sales. **Admin → Bidders** lets you note an ID check per bidder.

---

## Updating the site later

Every change pushed to the `main` branch on GitHub deploys automatically. If a deployment fails, Vercel keeps the last working version live. You can roll back from **Deployments → ⋯ → Promote to Production** on an older deployment.
