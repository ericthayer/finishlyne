# Setup: accounts Finishlyne needs

Three things only the owner can create. None of the values below are secrets except where marked; secrets go into Supabase or Netlify settings, never into the repo.

## 1. Supabase project

1. Create a project (free tier is fine to start; see SPEC §8 on the inactivity pause).
2. **Apply the schema** (one time, about a minute):
   1. Open the project in the Supabase dashboard → **SQL Editor** → **New query**.
   2. Paste the whole of [`supabase/migrations/20261010000000_init.sql`](../supabase/migrations/20261010000000_init.sql) and click **Run**. It should finish with "Success. No rows returned".
   3. Check: **Table Editor** lists 10 tables (`projects`, `ship_criteria`, `decisions`, `blockers`, `project_platforms`, `checkpoints`, `repo_links`, `issue_links`, `project_events`, `user_settings`), each marked RLS enabled.

   CLI alternative: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Point the app at the project:** in **Project Settings → API Keys** copy the **Project URL** and the **publishable key** (`sb_publishable_…`). Both are public by design (row-level security protects the data). Put them in:
   - `.env.local` at the repo root for local dev (copy `.env.example`; the file is gitignored), and
   - Netlify → Site configuration → Environment variables, once the site exists (step 3).

   Never use the **secret** key (`sb_secret_…`) in the app or the repo.

## 2. GitHub App (decided 2026-10-10: GitHub App, not OAuth App)

GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.

| Setting | Value |
|---|---|
| Name | `Finishlyne (<your handle>)` |
| Homepage URL | Netlify site URL |
| Callback URL | `https://<supabase-ref>.supabase.co/auth/v1/callback` |
| Request user authorization (OAuth) during installation | On |
| Webhook URL | `https://<supabase-ref>.supabase.co/functions/v1/github-webhook` (Phase 3) |
| Webhook secret | Generate; store in Supabase function secrets as `GITHUB_WEBHOOK_SECRET` (**secret**) |
| Repository permissions | Metadata: Read · Contents: Read · Issues: Read · Pull requests: Read |
| Account permissions | Email addresses: Read |
| Subscribe to events | Push, Pull request, Issues, Installation target |
| Where can this App be installed | Only on this account |

Then:
- Generate a **private key**; store it in Supabase function secrets as `GITHUB_APP_PRIVATE_KEY` (**secret**), with `GITHUB_APP_ID`.
- In Supabase → Authentication → Providers → GitHub, paste the App's **Client ID** and **Client secret** (**secret**).
- Install the App on your account (GitHub App page → **Install App**) and pick the repos Finishlyne may read.
- Deploy the `github` Edge Function (`supabase/functions/github`): `npx supabase functions deploy github --no-verify-jwt`. It checks the caller's session itself. The GitHub page (rail → GitHub, `/github`) then shows your repos; until the two secrets above exist it says which are missing.

## 3. Netlify site

Connect the repo (build settings come from `netlify.toml`) and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or their `VITE_` forms) as env vars.

## 4. Sign-in redirect URLs

Supabase only redirects back to URLs it knows. In **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| Site URL | The Netlify production URL, e.g. `https://ericthayer-dev.netlify.app` |
| Redirect URLs | `http://localhost:5173/**` (local dev) and `https://*--ericthayer-dev.netlify.app/**` (deploy previews) |

Then check end to end: open a deploy preview, click **Continue with GitHub**, approve the Finishlyne App, and you land on an empty Overview. That is Phase 0's done-when.

## 5. Anthropic API key (Phase 2, for Park drafts)

1. In the [Anthropic Console](https://console.anthropic.com), create a key named `finishlyne` and set a monthly spend limit on it.
2. In Supabase → **Edge Functions → Secrets**, add it as `ANTHROPIC_API_KEY` (**secret**). CLI alternative: `npx supabase secrets set ANTHROPIC_API_KEY=…`.

Never put it in `.env.local`, Netlify env vars or the repo; only the `ai-draft-checkpoint` function reads it.

## 6. Netlify token (site previews)

Screenshots and live-site thumbnails work without this. It adds each linked project's Netlify deploy state, deploy previews and Netlify's own screenshot.

1. In Netlify → **User settings → Applications → Personal access tokens**, create a token named `finishlyne` (read access is all it uses).
2. In Supabase → **Edge Functions → Secrets**, add it as `NETLIFY_TOKEN` (**secret**; `NETLIFY_KEY` also works).
3. The `netlify` Edge Function (`supabase/functions/netlify`) is deployed with `--no-verify-jwt`; it checks the caller's session itself and answers only when the caller's GitHub login matches the GitHub account connected to that Netlify user.

Then Edit on a project lists your Netlify sites. Screenshots go to the private `project-screenshots` Storage bucket (migration `20261018000000_site_previews.sql`).
