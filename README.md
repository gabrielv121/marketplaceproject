# EXCH Marketplace Template

P2P marketplace (React + Vite + Supabase) with Stripe Checkout, Connect payouts, Shippo labels, and admin verification.

## Local development

1. Copy `.env.example` → `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from [Supabase](https://supabase.com/dashboard) → Project Settings → API.
2. Run migrations in `supabase/migrations/` (SQL editor or `npx supabase@latest db push` when linked).
3. `npm install` then `npm run dev`.

See `.env.example` for Edge Function secrets (Stripe, MailerSend SMTP, Shippo) — set those in **Supabase → Edge Functions → Secrets**, not in `.env.local`.

## Deploy frontend (Vercel)

1. Push this repo to GitHub.
2. [vercel.com](https://vercel.com) → Import repository.
3. Build: `npm run build`, output: `dist`.
4. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Update Supabase **Auth → URL configuration** (Site URL + redirects) to your Vercel URL.
6. `npx supabase@latest secrets set CHECKOUT_SITE_URL=https://your-app.vercel.app` and redeploy checkout functions.

Stripe webhook URL (unchanged): `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

## Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: marketplace template"
```

Create a **private** repo on GitHub, then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Never commit `.env.local` or service-role keys.
