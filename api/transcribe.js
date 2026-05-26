// Vercel Serverless Function: /api/transcribe
// Tar emot ljud (base64) från Peak Fitness-appen och transkriberar via OpenAI Whisper.
// API-nyckeln är hemlig (env var OPENAI_API_KEY på Vercel).
// Bara inloggade Supabase-användare får använda — verifieras via JWT.

const SUPABASE_URL = 'https://xywrlqqvdptafunsqebi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5d3JscXF2ZHB0YWZ1bnNxZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTM3MjQsImV4cCI6MjA5NDQyOTcyNH0.3O3drJ_bXf1__MjOHjRqj_AvxlBT1MN9K8r3iThoxlE';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: verifiera Supabase JWT
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Inte inloggad' });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Ogiltig token' });
  } catch (e) {
    return res.status(401).json({ error: 'Auth-fel: ' + e.message });
  }

  // Body: { audio: base64, mime }
  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    return res.status(400).json({ error: 'Ogiltig JSON' });
  }
  const { audio, mime = 'audio/webm' } = payload;
  if (!audio) return res.status(400).json({ error: 'audio (base64) krävs' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY ej satt på servern' });
  }

  try {
    const buf = Buffer.from(audio, 'base64');
    // Filändelse som Whisper accepterar, härledd ur mime
    const ext = /mp4|m4a/.test(mime) ? 'mp4' : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : /ogg/.test(mime) ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), `audio.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', 'sv');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` }, // låt fetch sätta multipart-headern
      body: form
    });
    const data = await r.json();
    if (!r.ok) {
      console.warn('Whisper fel:', r.status, data);
      return res.status(r.status).json({ error: (data.error && data.error.message) || 'Transkriberingsfel' });
    }
    return res.status(200).json({ text: data.text || '' });
  } catch (e) {
    console.error('Transcribe exception:', e);
    return res.status(500).json({ error: 'Transkriberingsfel: ' + e.message });
  }
}
