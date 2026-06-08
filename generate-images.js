const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = '004284fb164c993afcc5761e9f3c500c';
const OUTPUT_DIR = __dirname;

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.kie.ai',
      path: urlPath,
      method,
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
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(dest); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function generate(prompt, filename) {
  const cr = await apiRequest('POST', '/api/v1/jobs/createTask', {
    model: 'gpt-image-2-text-to-image',
    input: { prompt, aspect_ratio: '1:1', resolution: '2K' },
  });
  if (cr.code !== 200 || !cr.data || !cr.data.taskId) throw new Error(`Create failed: ${JSON.stringify(cr)}`);
  const taskId = cr.data.taskId;
  console.log(`    taskId: ${taskId}`);

  for (let i = 0; i < 90; i++) {
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
          // KIE returns { resultUrls: ["https://..."] }
          if (rj.resultUrls && Array.isArray(rj.resultUrls) && rj.resultUrls.length > 0) {
            imgUrl = rj.resultUrls[0];
          } else if (rj.url) {
            imgUrl = rj.url;
          } else if (typeof rj === 'string' && rj.startsWith('http')) {
            imgUrl = rj;
          }
        } catch {
          if (typeof rec.resultJson === 'string' && rec.resultJson.startsWith('http')) {
            imgUrl = rec.resultJson;
          }
        }
      }

      if (!imgUrl) throw new Error('No image URL in result');

      const out = path.join(OUTPUT_DIR, filename);

      // Get permanent download URL
      try {
        const dl = await apiRequest('POST', '/api/v1/common/download-url', { url: imgUrl });
        if (dl.code === 200 && dl.data) imgUrl = dl.data;
      } catch {}

      await download(imgUrl, out);
      const size = fs.statSync(out).size;
      console.log(`    size: ${(size/1024).toFixed(0)} KB`);
      return out;
    }

    if (i % 6 === 5) console.log(`    polling... ${(i+1)*5}s (state: ${state})`);
  }
  throw new Error('Timeout 450s');
}

const IMAGES = [
  {
    file: 'nattovia-product-photo-main.png',
    prompt: `Premium supplement product photography. A white stand-up resealable pouch centered on a clean white background with soft natural shadow. The pouch displays "Nattovia" brand name at top in elegant black serif font, "nattokinase" in large bold dark brown text, "4,000 FU per serving", "made with MCT oil" with a small coconut icon. Below: "CoQ10 · bromelain · turmeric · ginger · olive leaf · white willow bark". Right side: "GMO free · gluten free · lab tested". Bottom: "enteric coated softgels ultra absorption" and "120 Softgels Dietary Supplement". A small pile of golden soybeans at the base. Shot on Canon EOS R5, 100mm macro, f/8, soft diffused studio lighting. Clean e-commerce aesthetic, minimal composition.`,
  },
  {
    file: 'nattovia-product-lifestyle.png',
    prompt: `Premium lifestyle supplement product photograph. A white stand-up pouch labeled "Nattovia nattokinase" placed on a clean light marble surface. Several golden amber softgel capsules scattered artfully around the pouch. A halved fresh coconut and small glass vessel of golden MCT oil nearby. Subtle dark forest green botanical leaf accents. Warm inviting morning light from the left side. Elegant minimal composition with generous white space. Shot on Sony A7R IV, 85mm f/2.8, shallow depth of field with product sharp and background soft. Premium wellness brand aesthetic, warm color grading. Clean and inviting.`,
  },
  {
    file: 'nattovia-key-benefits.png',
    prompt: `Clean modern supplement brand infographic on white background. At top, brand name "Nattovia" in black serif font with dark forest green decorative underline. Below, five key health benefits arranged in a visually balanced layout. Each benefit has a simple elegant flat icon in dark forest green color and descriptive text in clean black typography: 1. Heart with flowing lines - "Supports Clean Blood Flow", 2. Blood pressure gauge - "Healthy Blood Pressure Support", 3. Heart with protective shield - "Heart and Artery Health", 4. Brain with energy rays - "Energy and Mental Clarity", 5. Molecule with absorption arrows - "Enhanced MCT Absorption". Premium trustworthy medical-grade clean design with generous whitespace.`,
  },
  {
    file: 'nattovia-softgel-closeup.png',
    prompt: `Extreme macro close-up photograph of premium golden amber enteric-coated softgel supplement capsules. Approximately fifteen capsules arranged beautifully on a clean white surface. Rich warm golden-amber translucent color with glossy sheen reflecting soft studio light. Some capsules stacked, others scattered naturally. Sharp detail showing smooth enteric coating surface. Warm directional lighting from upper-left creating subtle shadows and highlighting translucent gelatin quality. Shot on Canon EOS R5, 100mm f/2.8 macro lens, shallow depth of field with creamy bokeh. Text "Enteric Coated Softgels" in dark forest green at top. Premium pharmaceutical product photography.`,
  },
  {
    file: 'nattovia-supplement-facts.png',
    prompt: `A clean professional Supplement Facts panel design on white background. Standard FDA-style nutrition label format with thick black top border. Title "Supplement Facts" in bold black. Shows: Serving Size 1 Softgel, Servings Per Container 120. Ingredients listed with amounts aligned right: Nattokinase 4,000 FU, Coenzyme Q10 100mg, Bromelain 100mg, Turmeric Extract 200mg, Ginger Extract 100mg, Olive Leaf Extract 100mg, White Willow Bark 50mg, MCT Oil 500mg. Daily Value column with asterisks. Footer: Daily Value not established. Brand name "Nattovia" above the panel in elegant black serif font. Dark forest green accent elements. Clean legible typography, premium supplement label design.`,
  },
  {
    file: 'nattovia-trusted-quality.png',
    prompt: `Premium supplement quality trust badges infographic on white background. Six certification badges arranged in a clean two-by-three grid layout. Each badge is circular or shield-shaped in dark forest green with white icon details inside. The six badges: laboratory beaker with checkmark labeled "3rd Party Lab Tested", leaf icon labeled "GMO Free", wheat stalk with X labeled "Gluten Free", shield with capsule labeled "Enteric Coated", star badge labeled "GMP Certified", clean bottle icon labeled "No Fillers". Brand name "Nattovia" at top in black serif typography. Below badges: "Quality You Can Trust" in dark forest green. Modern trustworthy supplement brand design with generous spacing.`,
  },
  {
    file: 'nattovia-mechanism-mct.png',
    prompt: `Modern health supplement mechanism infographic showing a three-step vertical process on white background. Dark forest green as primary accent color. Step 1 in green circle with number 1, labeled "CLEAR" with simplified artery cross-section icon showing flowing blood, text "Nattokinase dissolves fibrin". Step 2 in green circle with number 2, labeled "REFUEL" with heart icon and energy bolt, text "CoQ10 powers your heart". Step 3 in green circle with number 3, labeled "ABSORB" with capsule and absorption arrows, text "MCT Oil plus Enteric Coating". Flowing connector arrows between steps. Header "How Nattovia Works" in bold black serif font. Clean scientific premium medical infographic with flat design icons.`,
  },
  {
    file: 'nattovia-90-day-guarantee.png',
    prompt: `Premium money-back guarantee graphic for supplement brand on white background. A large circular emblem centered in dark forest green with bold white text "90 Days" in center and "Risk Free Guarantee" arcing around the circle. Above the emblem: headline "90-Day Money-Back Guarantee" in bold dark green serif text. Below: "Try Risk-Free" in medium dark font, then "Not satisfied? Full refund. No questions asked." in gray text. A small white supplement pouch labeled "Nattovia" positioned to the lower right of the badge. Subtle warm radial gradient on white background. Premium trustworthy design communicating confidence and zero-risk. Clean typography with generous whitespace.`,
  },
];

(async () => {
  console.log(`Generating ${IMAGES.length} images via KIE AI...\n`);
  let ok = 0, fail = 0;
  for (let i = 0; i < IMAGES.length; i++) {
    const img = IMAGES[i];
    console.log(`[${i+1}/${IMAGES.length}] ${img.file}`);
    try {
      const p = await generate(img.prompt, img.file);
      console.log(`  OK: ${p}\n`);
      ok++;
    } catch (e) {
      console.error(`  FAIL: ${e.message}\n`);
      fail++;
    }
    if (i < IMAGES.length - 1) await sleep(2000);
  }
  console.log(`\nDone! ${ok} succeeded, ${fail} failed.`);
})();
