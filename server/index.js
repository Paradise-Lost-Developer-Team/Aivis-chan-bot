const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3001;

// Basic health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Proxy speakers: forward to internal engine service
app.get('/api/tts/speakers', async (req, res) => {
  try {
    // prefer internal cluster DNS
    const engineUrls = [
      'http://aivisspeech-engine.aivis-chan-bot.svc.cluster.local:10101/speakers',
      'http://aivisspeech-engine:10101/speakers',
      'http://localhost:10101/speakers'
    ];

    let lastErr = null;
    for (const url of engineUrls) {
      try {
        const r = await fetch(url);
        if (!r.ok) {
          lastErr = new Error(`Engine responded ${r.status} at ${url}`);
          continue;
        }
        const body = await r.json();
        return res.json(body);
      } catch (e) {
        lastErr = e;
        continue;
      }
    }

    res.status(502).json({ error: 'Failed to reach aivisspeech engine', detail: lastErr && lastErr.message });
  } catch (e) {
    res.status(500).json({ error: 'Internal error', detail: e && e.message });
  }
});

// Optional: per-guild speakers endpoint that may be provided by engine or bot
app.get('/api/guilds/:guildId/speakers', async (req, res) => {
  const { guildId } = req.params;
  try {
    const engineUrls = [
      `http://aivisspeech-engine.aivis-chan-bot.svc.cluster.local:10101/guilds/${guildId}/speakers`,
      `http://aivisspeech-engine:10101/guilds/${guildId}/speakers`,
      `http://localhost:10101/guilds/${guildId}/speakers`
    ];

    for (const url of engineUrls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const body = await r.json();
        return res.json(body);
      } catch (e) {
        continue;
      }
    }

    // If engine doesn't provide guild-specific speakers, try generic /speakers
    const generic = await fetch('http://aivisspeech-engine.aivis-chan-bot.svc.cluster.local:10101/speakers');
    if (generic.ok) {
      const body = await generic.json();
      return res.json(body);
    }

    res.status(404).json({ error: 'No speakers for guild' });
  } catch (e) {
    res.status(500).json({ error: 'Internal error', detail: e && e.message });
  }
});

app.listen(PORT, () => console.log(`TTS proxy listening on ${PORT}`));
