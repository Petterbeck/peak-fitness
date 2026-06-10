// Vercel Serverless Function: /api/strava/activities
// Listar de senaste aktiviteterna från Strava för den inloggade användaren.
// Refreshar access_token om det gått ut. Bara inloggade Supabase-användare.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5d3JscXF2ZHB0YWZ1bnNxZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM3MjQsImV4cCI6MjA5NDQyOTcyNH0.3O3drJ_bXf1__MjOHjRqj_AvxlBT1MN9K8r3iThoxlE';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verifiera Supabase-användaren
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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!serviceRoleKey || !clientId || !clientSecret) {
    return res.status(500).json({ error: 'Server config saknas (env vars)' });
  }

  try {
    const tokens = await getAndRefreshStravaTokens(userId, serviceRoleKey, clientId, clientSecret);

    // Hämta senaste aktiviteter (max 50 per page)
    const perPage = Math.min(parseInt(req.query.per_page) || 30, 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const actRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const activities = await actRes.json();
    if (!actRes.ok) {
      return res.status(actRes.status).json({ error: activities.message || 'Strava API-fel' });
    }

    // Skicka bara sammanfattningsfält (minska payload)
    const summary = activities.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      sport_type: a.sport_type,
      start_date: a.start_date_local || a.start_date,
      distance: a.distance,
      moving_time: a.moving_time,
      elapsed_time: a.elapsed_time,
      total_elevation_gain: a.total_elevation_gain,
      average_speed: a.average_speed,
      average_heartrate: a.average_heartrate || null,
      max_heartrate: a.max_heartrate || null,
      has_heartrate: a.has_heartrate
    }));

    return res.status(200).json({
      activities: summary,
      athlete: {
        firstname: tokens.athlete_firstname,
        lastname: tokens.athlete_lastname
      }
    });
  } catch (e) {
    console.error('Strava activities fetch error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// Hämta tokens från Supabase + refresha om de gått ut, returnera uppdaterade tokens.
async function getAndRefreshStravaTokens(userId, serviceRoleKey, clientId, clientSecret) {
  const tokRes = await fetch(
    `${SUPABASE_URL}/rest/v1/strava_tokens?user_id=eq.${userId}&select=*`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
  );
  const tokRows = await tokRes.json();
  if (!Array.isArray(tokRows) || tokRows.length === 0) {
    const e = new Error('Strava ej kopplad. Tryck "Logga in med Strava" först.');
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
