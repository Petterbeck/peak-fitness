// Vercel Serverless Function: /api/claude
// Proxar anrop från Peak Fitness-appen till Anthropic Claude API.
// API-nyckeln är hemlig (env var ANTHROPIC_API_KEY på Vercel).
// Bara inloggade Supabase-användare får använda — verifieras via JWT.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5d3JscXF2ZHB0YWZ1bnNxZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM3MjQsImV4cCI6MjA5NDQyOTcyNH0.3O3drJ_bXf1__MjOHjRqj_AvxlBT1MN9K8r3iThoxlE';

export default async function handler(req, res) {
  // CORS-headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: verifiera Supabase JWT
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Inte inloggad' });
  }
  const token = authHeader.slice('Bearer '.length);

  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Ogiltig token' });
    }
    const user = await userRes.json();
    userId = user.id;
  } catch (e) {
    return res.status(401).json({ error: 'Auth-fel: ' + e.message });
  }

  // Parse request body (Vercel parsar JSON automatiskt om Content-Type är application/json)
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: 'Ogiltig JSON' });
  }

  const {
    messages,
    system,
    model = 'claude-sonnet-4-5',
    max_tokens = 1024
  } = payload;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages-array krävs' });
  }

  // Anropa Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API-nyckel saknas på servern (ANTHROPIC_API_KEY ej satt)' });
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens,
        ...(system && { system }),
        messages
      })
    });

    const data = await claudeRes.json();

    if (!claudeRes.ok) {
      console.warn('Claude API fel:', claudeRes.status, data);
      return res.status(claudeRes.status).json(data);
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('Claude API exception:', e);
    return res.status(500).json({ error: 'Claude API-fel: ' + e.message });
  }
}
