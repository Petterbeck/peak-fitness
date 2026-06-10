// Vercel Serverless Function: /api/strava/callback
// Tar emot OAuth-code från Strava, byter den mot access+refresh-tokens, och sparar
// dem i Supabase via service_role. Redirectar sedan tillbaka till appen.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const APP_URL = 'https://peak-fitness-psi.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state, error } = req.query || {};

  if (error) {
    return res.redirect(`${APP_URL}/?strava=error&msg=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return res.redirect(`${APP_URL}/?strava=error&msg=missing_params`);
  }

  const userId = state;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!clientId || !clientSecret || !serviceRoleKey) {
    return res.redirect(`${APP_URL}/?strava=error&msg=server_config_missing`);
  }

  try {
    // Byt code → access_token + refresh_token
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Strava token exchange failed:', tokenData);
      return res.redirect(`${APP_URL}/?strava=error&msg=${encodeURIComponent(tokenData.message || 'token_exchange_failed')}`);
    }

    // Spara i strava_tokens via service_role (UPSERT)
    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/strava_tokens?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        athlete_id: tokenData.athlete && tokenData.athlete.id || null,
        athlete_firstname: tokenData.athlete && tokenData.athlete.firstname || null,
        athlete_lastname: tokenData.athlete && tokenData.athlete.lastname || null,
        updated_at: new Date().toISOString()
      })
    });

    if (!saveRes.ok) {
      const txt = await saveRes.text();
      console.error('Supabase save failed:', saveRes.status, txt);
      return res.redirect(`${APP_URL}/?strava=error&msg=save_failed`);
    }

    return res.redirect(`${APP_URL}/?strava=connected`);
  } catch (e) {
    console.error('Strava callback error:', e);
    return res.redirect(`${APP_URL}/?strava=error&msg=${encodeURIComponent(e.message)}`);
  }
}
