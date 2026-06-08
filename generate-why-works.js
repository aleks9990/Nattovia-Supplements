const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = '004284fb164c993afcc5761e9f3c500c';
const OUTPUT_DIR = __dirname;

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.kie.ai', path: urlPath, method,
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error(d.slice(0,300))); } });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return download(res.headers.location, dest).then(resolve).catch(reject);
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(dest); });
    }).on('error', reject);
  });
}

async function generate(prompt, filename, ratio) {
  const cr = await apiRequest('POST', '/api/v1/jobs/createTask', {
    model: 'gpt-image-2-text-to-image',
    input: { prompt, aspect_ratio: ratio, resolution: '2K' },
  });
  if (cr.code !== 200 || !cr.data?.taskId) throw new Error(`Create failed: ${JSON.stringify(cr)}`);
  const taskId = cr.data.taskId;
  console.log(`  taskId: ${taskId}`);

  for (let i = 0; i < 120; i++) {
    await sleep(5000);
    const sr = await apiRequest('GET', `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    if (sr.code !== 200) continue;
    const rec = sr.data;
    const state = (rec.state || '').toLowerCase();
    if (state === 'failed' || state === 'fail') throw new Error(`Failed: ${rec.failMsg || 'unknown'}`);
    if (state === 'completed' || state === 'success') {
      let imgUrl = null;
      if (rec.resultJson) {
        try {
          const rj = typeof rec.resultJson === 'string' ? JSON.parse(rec.resultJson) : rec.resultJson;
          if (rj.resultUrls && rj.resultUrls.length > 0) imgUrl = rj.resultUrls[0];
          else if (rj.url) imgUrl = rj.url;
        } catch {}
      }
      if (!imgUrl) throw new Error('No URL in result');
      const out = path.join(OUTPUT_DIR, filename);
      try {
        const dl = await apiRequest('POST', '/api/v1/common/download-url', { url: imgUrl });
        if (dl.code === 200 && dl.data) imgUrl = dl.data;
      } catch {}
      await download(imgUrl, out);
      console.log(`  size: ${(fs.statSync(out).size/1024).toFixed(0)} KB`);
      return out;
    }
    if (i % 6 === 5) console.log(`  polling... ${(i+1)*5}s (state: ${state})`);
  }
  throw new Error('Timeout');
}

const prompt = `A warm, serene lifestyle photograph of a healthy woman in her 50s with natural silver-streaked hair, sitting at a bright sunlit kitchen table in the morning. She is calmly holding a single golden amber softgel capsule between her fingers, about to take it with a glass of water. A small white supplement pouch sits on the table beside a cup of green tea and a small Japanese ceramic bowl. Soft morning golden light streaming through a window, creating a peaceful daily ritual atmosphere. She looks relaxed, confident, and healthy. The kitchen is clean, modern, minimal with natural wood and white tones. Shot on Canon EOS R5, 85mm f/2.0 lens, shallow depth of field with creamy bokeh. Warm natural color palette, lifestyle wellness photography. Editorial health magazine aesthetic, like a feature in Prevention or Women's Health. No text, no labels, no watermarks.`;

(async () => {
  console.log('Generating "Why Real Nattokinase Works" section image...\n');
  try {
    const p = await generate(prompt, 'nattovia-safe-daily.png', '1:1');
    console.log(`\nOK: ${p}`);
  } catch (e) {
    console.error(`\nFAIL: ${e.message}`);
  }
})();
