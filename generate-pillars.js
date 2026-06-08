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
  console.log(`    taskId: ${taskId}`);

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
      console.log(`    size: ${(fs.statSync(out).size/1024).toFixed(0)} KB`);
      return out;
    }
    if (i % 6 === 5) console.log(`    polling... ${(i+1)*5}s (state: ${state})`);
  }
  throw new Error('Timeout');
}

const PILLARS = [
  {
    file: 'nattovia-pillar-nattokinase-coq10.png',
    prompt: `A warm, inviting close-up photograph of traditional Japanese natto fermented soybeans in a small wooden bowl, with sticky stringy threads visible, alongside a few golden amber softgel capsules placed nearby on a dark wooden surface. Warm amber side lighting creating a rich, moody atmosphere. Subtle steam or warmth rising from the natto. The scene feels authentic and traditional, connecting to Japanese fermentation heritage. Shot on Canon EOS R5, 85mm f/2.8 lens, shallow depth of field. Warm earthy color palette with browns, ambers, and golden tones. Food photography editorial style, Bon Appetit feature aesthetic. No text, no labels, no watermarks.`,
  },
  {
    file: 'nattovia-pillar-4000fu-potency.png',
    prompt: `A close-up photograph of several golden amber translucent softgel capsules arranged on a clean dark wooden surface, some stacked, with warm directional light from the side highlighting their glossy enteric coating. The capsules look premium, medical-grade, and potent. A small wooden spoon with white powder or extract nearby suggests concentrated potency. Warm tones, shallow depth of field. Shot on Canon EOS R5, 100mm f/2.8 macro, warm amber lighting from the left. Rich warm color grading, moody supplement photography. Bon Appetit feature aesthetic. No text, no labels, no watermarks.`,
  },
  {
    file: 'nattovia-pillar-mct-absorption.png',
    prompt: `A warm editorial photograph of golden MCT coconut oil being poured from a small glass bottle into a dark wooden spoon, with the oil catching warm light and appearing translucent golden. A halved coconut sits in the soft background. The pour creates a beautiful thin golden stream. Warm ambient lighting, shallow depth of field with creamy bokeh. Shot on Sony A7R IV, 85mm f/2.0 lens. Rich warm color palette, golden hour feel. Editorial food photography aesthetic. Premium, clean, natural. No text, no labels, no watermarks.`,
  },
  {
    file: 'nattovia-pillar-lab-tested.png',
    prompt: `A professional photograph of a laboratory scientist in a white lab coat and blue nitrile gloves, examining a clear glass beaker with liquid in a modern clean laboratory setting. Multiple glass flasks and test tubes visible on the lab bench. Bright clean white and blue toned lighting suggesting sterile scientific precision. The scientist is viewed from a three-quarter angle, focused on the sample. Shot on Canon EOS R5, 70-200mm f/2.8, clean clinical lighting. Cool tones, crisp whites, professional laboratory photography. Scientific editorial style. No text, no labels.`,
  },
];

(async () => {
  console.log(`Generating ${PILLARS.length} pillar images...\n`);
  let ok = 0;
  for (let i = 0; i < PILLARS.length; i++) {
    const img = PILLARS[i];
    console.log(`[${i+1}/${PILLARS.length}] ${img.file}`);
    try {
      const p = await generate(img.prompt, img.file, '4:3');
      console.log(`  OK: ${p}\n`);
      ok++;
    } catch (e) {
      console.error(`  FAIL: ${e.message}\n`);
    }
    if (i < PILLARS.length - 1) await sleep(3000);
  }
  console.log(`\nDone! ${ok}/${PILLARS.length} succeeded.`);
})();
