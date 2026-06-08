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

async function generate(prompt, filename) {
  const cr = await apiRequest('POST', '/api/v1/jobs/createTask', {
    model: 'gpt-image-2-text-to-image',
    input: { prompt, aspect_ratio: '1:1', resolution: '2K' },
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

    if (state === 'failed' || state === 'fail') throw new Error(`Failed: ${rec.failMsg || rec.failCode || 'unknown'}`);

    if (state === 'completed' || state === 'success') {
      let imgUrl = null;
      if (rec.resultJson) {
        try {
          const rj = typeof rec.resultJson === 'string' ? JSON.parse(rec.resultJson) : rec.resultJson;
          if (rj.resultUrls && rj.resultUrls.length > 0) imgUrl = rj.resultUrls[0];
          else if (rj.url) imgUrl = rj.url;
          else if (typeof rj === 'string' && rj.startsWith('http')) imgUrl = rj;
        } catch {
          if (typeof rec.resultJson === 'string' && rec.resultJson.startsWith('http')) imgUrl = rec.resultJson;
        }
      }
      if (!imgUrl) throw new Error(`No URL. Record keys: ${Object.keys(rec).join(',')}, resultJson type: ${typeof rec.resultJson}, resultJson preview: ${String(rec.resultJson).slice(0,200)}`);

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
  throw new Error('Timeout 600s');
}

const REMAINING = [
  {
    file: 'nattovia-supplement-facts.png',
    prompt: `A clean professional Supplement Facts panel design on white background. Standard FDA-style nutrition label format with thick black top border. Title "Supplement Facts" in bold black. Shows: Serving Size 1 Softgel, Servings Per Container 120. Ingredients listed: Nattokinase 4,000 FU, Coenzyme Q10 100mg, Bromelain 100mg, Turmeric Extract 200mg, Ginger Extract 100mg, Olive Leaf Extract 100mg, White Willow Bark 50mg, MCT Oil 500mg. Brand name "Nattovia" above the panel in elegant black serif font. Dark forest green accent elements. Clean legible supplement label design.`,
  },
  {
    file: 'nattovia-trusted-quality.png',
    prompt: `Premium supplement quality trust badges infographic on white background. Six certification badges in a clean grid layout. Each badge is circular in dark forest green with white icons. The badges show: lab beaker checkmark "3rd Party Lab Tested", leaf "GMO Free", wheat X "Gluten Free", shield capsule "Enteric Coated", star "GMP Certified", bottle "No Fillers". Brand "Nattovia" at top in black serif. Below: "Quality You Can Trust" in dark green. Modern trustworthy design with generous spacing.`,
  },
  {
    file: 'nattovia-mechanism-mct.png',
    prompt: `Modern health supplement infographic, three-step vertical process on white background. Dark forest green accent color. Step 1 "CLEAR" with artery icon, text "Nattokinase dissolves fibrin". Step 2 "REFUEL" with heart energy icon, text "CoQ10 powers your heart". Step 3 "ABSORB" with capsule arrows icon, text "MCT Oil plus Enteric Coating". Each step number in green circle. Connector arrows between steps. Header "How Nattovia Works" in bold black serif. Clean scientific medical infographic.`,
  },
  {
    file: 'nattovia-90-day-guarantee.png',
    prompt: `Premium money-back guarantee graphic on white background. Large circular emblem in dark forest green with white text "90 Days" centered and "Risk Free Guarantee" around the circle. Above: "90-Day Money-Back Guarantee" headline in bold dark green. Below: "Try Risk-Free" then "Full refund. No questions asked." in gray. Small white supplement pouch "Nattovia" to the lower right. Warm radial gradient background. Premium trustworthy guarantee design with clean typography.`,
  },
];

(async () => {
  console.log(`Generating ${REMAINING.length} remaining images...\n`);
  let ok = 0;
  for (let i = 0; i < REMAINING.length; i++) {
    const img = REMAINING[i];
    console.log(`[${i+1}/${REMAINING.length}] ${img.file}`);
    try {
      const p = await generate(img.prompt, img.file);
      console.log(`  OK: ${p}\n`);
      ok++;
    } catch (e) {
      console.error(`  FAIL: ${e.message}\n`);
    }
    if (i < REMAINING.length - 1) await sleep(3000);
  }
  console.log(`\nDone! ${ok}/${REMAINING.length} succeeded.`);
})();
