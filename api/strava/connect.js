// Vercel Serverless Function: /api/strava/connect
// Initierar OAuth-flödet mot Strava — verifierar Supabase-användaren och returnerar
// en authorization-URL som klienten ska redirecta till. State = user_id så vi vet
// vem vi ska spara tokens åt i callback.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5d3JscXF2ZHB0YWZ1bnNxZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM3MjQsImV4cCI6MjA5NDQyOTcyNH0.3O3drJ_bXf1__MjOHjRqj_AvxlBT1MN9K8r3iThoxlE';
const APP_URL = 'https://peak-fitness-psi.vercel.app';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Inte inloggad' });
  }
  const token = authHeader.slice('Bearer '.length);

  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Ogiltig token' });
    const user = await userRes.json();
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Auth-fel: ' + e.message });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'STRAVA_CLIENT_ID saknas på servern' });

  const redirectUri = `${APP_URL}/api/strava/callback`;
  const scope = 'read,activity:read_all';
  const state = userId;
  const authUrl = `https://www.strava.com/oauth/authorize`
    + `?client_id=${clientId}`
    + `&response_type=code`
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&approval_prompt=auto`
    + `&scope=${encodeURIComponent(scope)}`
    + `&state=${encodeURIComponent(state)}`;

  return res.status(200).json({ url: authUrl });
}
