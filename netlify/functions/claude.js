// Netlify Function: /api/claude
// Proxar anrop från Peak Fitness-appen till Anthropic Claude API.
// API-nyckeln är hemlig (env var ANTHROPIC_API_KEY på Netlify).
// Bara inloggade Supabase-användare får använda — verifieras via JWT.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5d3JscXF2ZHB0YWZ1bnNxZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM3MjQsImV4cCI6MjA5NDQyOTcyNH0.3O3drJ_bXf1__MjOHjRqj_AvxlBT1MN9K8r3iThoxlE';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth: verifiera Supabase JWT
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Inte inloggad' }) };
  }
  const token = authHeader.slice('Bearer '.length);

  let userId;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ogiltig token' }) };
    }
    const user = await userRes.json();
    userId = user.id;
  } catch (e) {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Auth-fel: ' + e.message }) };
  }

  // Parse request body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Ogiltig JSON' }) };
  }

  const {
    messages,
    system,
    model = 'claude-sonnet-4-5',
    max_tokens = 1024
  } = payload;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'messages-array krävs' }) };
  }

  // Anropa Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'API-nyckel saknas på servern (ANTHROPIC_API_KEY ej satt)' }) };
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
      return { statusCode: claudeRes.status, headers: CORS_HEADERS, body: JSON.stringify(data) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
  } catch (e) {
    console.error('Claude API exception:', e);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Claude API-fel: ' + e.message }) };
  }
};
