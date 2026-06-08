const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = '004284fb164c993afcc5761e9f3c500c';
const OUTPUT_DIR = path.join(__dirname, 'customers');

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

async function generate(prompt, filename) {
  const cr = await apiRequest('POST', '/api/v1/jobs/createTask', {
    model: 'gpt-image-2-text-to-image',
    input: { prompt, aspect_ratio: '1:1', resolution: '2K' },
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

const POUCH = `a white matte stand-up supplement pouch, approximately 15cm tall and 10cm wide. At the top in dark serif font it says "Nattovia". Below in large brown lowercase text "nattokinase". A brown oval badge "4,000 FU per serving". Below "made with MCT oil". Ingredient list: "CoQ10 · bromelain · turmeric · ginger · olive leaf · white willow bark". Three small green badges on right: "GMO free", "gluten free", "lab tested". Bottom half shows pale soybeans photo. Bottom text "enteric coated softgels ultra absorption" and "120 Softgels Dietary Supplement". White pouch with brown earth-tone accents, zip top`;

const RETRY = [
  {
    file: 'nattovia-ugc-female-3.png',
    prompt: `Casual smartphone photo of a 65-year-old Caucasian white woman with short gray hair and glasses, wearing a gray t-shirt, standing outside on her front porch. Green bushes behind her. She smiles warmly holding ${POUCH} with both hands at chest level, front label visible. Bright outdoor daylight. Amateur phone photo quality. No text, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-4.png',
    prompt: `Casual smartphone photo of a 60-year-old Caucasian white woman with auburn hair and glasses, wearing a navy cardigan, standing in her bright modern kitchen. She smiles holding ${POUCH} with one hand at chest level, front label facing camera. Natural daylight. Amateur phone photo quality. No text, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-2.png',
    prompt: `Casual smartphone photo of a 72-year-old Caucasian white man with gray hair and glasses, wearing a brown fleece, sitting at a wooden dining table in evening light. He rests chin on hands, smiling. ${POUCH} stands on the table in front of him, front label visible. Warm lamp lighting. Amateur phone photo quality. No text, no watermarks.`,
  },
];

(async () => {
  console.log(`Retrying ${RETRY.length} failed images...\n`);
  let ok = 0;
  for (let i = 0; i < RETRY.length; i++) {
    const img = RETRY[i];
    console.log(`[${i+1}/${RETRY.length}] ${img.file}`);
    try {
      const p = await generate(img.prompt, img.file);
      console.log(`  OK: ${p}\n`);
      ok++;
    } catch (e) {
      console.error(`  FAIL: ${e.message}\n`);
    }
    if (i < RETRY.length - 1) await sleep(2000);
  }
  console.log(`\nDone! ${ok}/${RETRY.length} succeeded.`);
})();
