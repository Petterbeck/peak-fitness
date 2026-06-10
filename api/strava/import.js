// Vercel Serverless Function: /api/strava/import?id=<activityId>
// Hämtar en specifik aktivitet PLUS dess laps (varv/intervaller) från Strava.
// Refreshar token om det behövs. Bara inloggade Supabase-användare.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5d3JscXF2ZHB0YWZ1bnNxZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM3MjQsImV4cCI6MjA5NDQyOTcyNH0.3O3drJ_bXf1__MjOHjRqj_AvxlBT1MN9K8r3iThoxlE';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Inte inloggad' });
  }
  const supaToken = authHeader.slice('Bearer '.length);
  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${supaToken}`, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Ogiltig token' });
    const user = await userRes.json();
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Auth-fel: ' + e.message });
  }

  const activityId = req.query.id;
  if (!activityId) return res.status(400).json({ error: 'activity id krävs' });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!serviceRoleKey || !clientId || !clientSecret) {
    return res.status(500).json({ error: 'Server config saknas (env vars)' });
  }

  try {
    const tokens = await getAndRefreshStravaTokens(userId, serviceRoleKey, clientId, clientSecret);

    // Hämta aktiviteten + dess laps parallellt
    const [actRes, lapsRes] = await Promise.all([
      fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      }),
      fetch(`https://www.strava.com/api/v3/activities/${activityId}/laps`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
    ]);

    const activity = await actRes.json();
    const laps = await lapsRes.json();

    if (!actRes.ok) {
      return res.status(actRes.status).json({ error: activity.message || 'Strava API-fel' });
    }

    return res.status(200).json({
      activity,
      laps: Array.isArray(laps) ? laps : []
    });
  } catch (e) {
    console.error('Strava import error:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}

async function getAndRefreshStravaTokens(userId, serviceRoleKey, clientId, clientSecret) {
  const tokRes = await fetch(
    `${SUPABASE_URL}/rest/v1/strava_tokens?user_id=eq.${userId}&select=*`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
  );
  const tokRows = await tokRes.json();
  if (!Array.isArray(tokRows) || tokRows.length === 0) {
    const e = new Error('Strava ej kopplad');
    e.statusCode = 404;
    throw e;
  }
  let tokens = tokRows[0];

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at <= now + 60) {
    const refreshRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      })
    });
    const refreshData = await refreshRes.json();
    if (!refreshRes.ok) {
      throw new Error('Token-refresh misslyckades: ' + (refreshData.message || 'okänt fel'));
    }
    tokens.access_token = refreshData.access_token;
    tokens.refresh_token = refreshData.refresh_token;
    tokens.expires_at = refreshData.expires_at;

    await fetch(
      `${SUPABASE_URL}/rest/v1/strava_tokens?user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          updated_at: new Date().toISOString()
        })
      }
    );
  }
  return tokens;
}
