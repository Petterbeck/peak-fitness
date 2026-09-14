# Peak Fitness — Setup & Konfiguration

Senast uppdaterad: 2026-09-14

## Översikt

Personlig träningsapp byggd som inlärningsprojekt. Plain HTML/JS, mobile-first, svenska.

- **Live URL:** https://peak-fitness-psi.vercel.app
- **GitHub-repo:** https://github.com/Petterbeck/peak-fitness (privat)
- **Hosting:** Vercel Hobby (auto-deploy från `main`, ~30 sek)
- **Databas + Auth:** Supabase (nya projektet i "Petterbeck"-org)

## Supabase

**Projekt-ID:** `nabylfjkuxoucliedhmz` (organisation: "Petterbeck", personal)

Detta är det NYA projektet (skapat 2026-09). Gamla `xywrlqqvdptafunsqebi` raderades av Supabase efter 90 dagars inaktivitet — hela databasen försvann, användarnas data räddades från lokala backup-filer och localStorage.

**Konfiguration finns i:**
- `supabase-config.js` — publik URL + anon key (OK att committa)
- Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY` (hemlig, används av serverless functions)
- Alla `api/strava/*.js` + `api/claude.js` har hardcoded URL + anon key (inte optimalt men fungerar)

**Site URL i Supabase:** `https://peak-fitness-psi.vercel.app` (måste vara Vercel-URL, inte Netlify)

**Redirect URLs:**
- `https://peak-fitness-psi.vercel.app/**`
- `https://*.vercel.app/**`
- `http://localhost:8000/**`

**Tabeller (alla med RLS):** profiles, exercises, pass_types, planned_workouts, workout_history, training_forms, user_goals, routines, routine_logs, sleep_logs, nutrition_logs, strava_tokens, data_snapshots, shares.

**Vid schemaändringar:** kör `supabase-migrations.sql` i SQL-editorn i Supabase Dashboard INNAN test — annars sync-fel. Filen är idempotent.

## Auth-flöde

**Metod:** OTP-kod via e-post (inte magic link).

**Varför inte magic link?** Öppnas i webbläsare istället för PWA:n, så session delas inte till installerad app. OTP fungerar oavsett vilken enhet/app som öppnar mailet.

**Kodlängd:** Supabase-projekt skapade efter mitten av 2025 använder 8-siffriga koder som default (tidigare 6). Appen accepterar båda: regex `/^\d{6,8}$/` i `verifyOtpCode()`, `maxlength=8` på input, auto-verify vid både 6 och 8 siffror.

**Signup:** Öppen — vem som helst som anger email + verifierar OTP skapar automatiskt ett konto. Barnen loggar in med sina egna emails, får eget konto, kan sen återställa från backup-fil.

**"Confirm email"-setting i Supabase:** AV. Om den är PÅ skickar Supabase confirm-länk istället för OTP-kod.

## SMTP (mailutskick av OTP)

**Tjänst:** Brevo (fd Sendinblue), Free 300 mail/dag.

**Konfigurerad i:** Supabase Dashboard → Authentication → Emails → Custom SMTP

| Fält | Värde |
|------|-------|
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | Brevos genererade `bXXXXXX@smtp-brevo.com` (INTE gmail) |
| Password | Brevo SMTP-nyckel (från Brevo → SMTP & API) |
| Sender email | `erikaxelpettersson@gmail.com` (Verified sender i Brevo) |
| Sender name | `Peak Fitness` |

**Varför inte Resend eller SendGrid?**
- **Resend:** Free-tier sandbox — kan bara skicka till kontoägarens egen email (erik@rentr.se). För restriktivt.
- **SendGrid:** Fri 60-dagars trial gick ut → "Maximum credits exceeded" trots att free-tier borde ge 100/dag. Kräver kortuppgifter för att låsa upp.
- **Brevo:** Free 300/dag, inget kort, inga trial-låsningar. Det som råkar fungera pragmatiskt.

**Domain-autentisering:** Ej gjort. `erikaxelpettersson@gmail.com` är verifierad som Single Sender i Brevo men gmail-domänen är inte DKIM/SPF-autentiserad via Brevo. Konsekvens: första OTP-mailet till en ny mottagare kan hamna i skräpposten → markera "inte skräppost" en gång, sen ok.

**Om spam-problem blir tjatiga senare:** verifiera egen domän i Brevo (kräver 3 DNS-poster hos domänleverantör, ~10 min).

**Email-template:** `Authentication → Emails → Magic link or OTP`. Body ska innehålla `{{ .Token }}`-placeholder. Templatet finns redigerat med Peak Fitness-branding.

## Datasäkerhet & backups

Efter att gamla Supabase-projektet försvann byggdes flera skydd:

1. **`syncToCloud()` raderar INTE längre cloud-rows vid lokala luckor.** Den gamla `deleteCloudOrphans`-koden flyttades till en separat "Städa moln"-knapp med bekräftelse-modal i Profil. Detta var orsaken till förlorade juli-pass tidigare.

2. **`data_snapshots`-tabellen** — `maybeCreateDailySnapshot()` sparar en full snapshot en gång/dag, `data_snapshots` behåller rullande 7 dagar. Kan återställas från Profil → Säkerhetskopia → Molnbackups.

3. **Lokal auto-backup** — sparas i localStorage-nyckeln `peak_autobackup`. Återställs från Profil → Säkerhetskopia → "Återställ senaste auto-backup (lokal)".

4. **Manuell export** — Profil → Säkerhetskopia → **Exportera data** genererar `peak-fitness-backup-YYYY-MM-DD.json`. Rekommendation: gör en manuell backup då och då och spara utanför enheten.

## PWA-installation

Login-sidan har en "Installera app"-knapp:

- **Android/Chrome:** använder `beforeinstallprompt`-eventet, en klick installerar direkt.
- **iOS Safari:** öppnar `#m-ios-install`-modal med grafisk guide (Dela-ikonen → "Lägg till på hemskärmen"). Modal har `z-index:200` för att ligga över auth-overlay.

**Detektion:** `isIosPlatform()`, `isPwaStandalone()`, `updatePwaButtonVisibility()`.

**Session-persistens i PWA:** Supabase-clientens `persistSession: true` gör att sessionen sparas i localStorage och överlever appstart. Vid utgången token → OTP igen.

## Vercel

**Projekt:** `peak-fitness-psi` (Vercel Hobby-plan)

**Env vars som måste finnas:**
- `SUPABASE_SERVICE_ROLE_KEY` — hemlig, används av API-functions för att bypassa RLS
- `ANTHROPIC_API_KEY` — för `/api/claude`
- `STRAVA_CLIENT_ID` + `STRAVA_CLIENT_SECRET` — för Strava OAuth

**Function timeouts** (i `vercel.json`):
- `/api/claude.js` — 60 sek (multimodal AI-anrop)
- `/api/transcribe.js` — 30 sek
- `/api/strava/*` — 10-20 sek

## Strava-integration

`/api/strava/connect` startar OAuth, `/api/strava/callback` sparar tokens i `strava_tokens`-tabellen (via service_role). `/api/strava/activities` + `/api/strava/import` refreshar tokens automatiskt.

**OBS 2026-09-14:** Strava-tokens försvann med gamla Supabase-projektet. Måste återkopplas i appen (Profil eller Träningsflik → "Logga in med Strava").

## Vanliga fel & fix

**"Fel: Error sending magic link email" (HTTP 500):**
- Kolla Supabase Auth-logs (`Logs → Auth logs`). Sök efter `error:`-fält i JSON:en.
- Vanliga orsaker: fel SMTP-nyckel, fel Username (måste vara Brevos `bXXXX@smtp-brevo.com`), Brevo-konto ej verifierat.

**Inloggning fungerar men data saknas:**
- Kolla Supabase Dashboard → Table Editor. Om tabellerna finns men är tomma → återställ från backup-fil.
- Om användaren har gammalt localStorage men nya Supabase → klicka "Synka till molnet" (INTE tvärtom!).

**PWA visar gammal version efter deploy:**
- Serviceworkers cachar aggressivt. Stäng PWA:n helt och öppna igen. Eller hard-reload i browser (Ctrl+Shift+R).

**Migrera till nytt Supabase-projekt (om det behövs igen):**
1. Skapa nytt projekt
2. Kör `supabase-migrations.sql` i SQL-editorn
3. Uppdatera URL + anon key i `supabase-config.js`, alla `api/strava/*.js`, `api/claude.js`
4. Uppdatera Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY` (nytt värde)
5. Konfigurera Custom SMTP + email-templates
6. Återställ användarna via `Återställ från fil` i appen

## Git-flow

Erik är på Petterbeck-konto (Windows Credential Manager cachar det).

```bash
git add <file>
git commit -m "..."
git push
```

→ Vercel deployar från `main` inom ~30 sek → hård-refresha appen.
