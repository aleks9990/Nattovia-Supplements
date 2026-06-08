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

// Exact product description — must appear identical in every image
const POUCH = `a white matte stand-up supplement pouch, approximately 15cm tall and 10cm wide. At the very top of the pouch in small dark elegant serif font it says "Nattovia". Below that in large brown lowercase serif text it says "nattokinase". Below the name is a small brown rounded oval badge that reads "4,000 FU per serving". Under that in small brown text "made with MCT oil". Then a line of small text listing "CoQ10 · bromelain · turmeric · ginger · olive leaf · white willow bark". On the right side of the pouch are three small circular green certification badges for "GMO free", "gluten free", "lab tested". The bottom half of the pouch features a photograph of pale yellow-beige soybeans. At the very bottom in small text "enteric coated softgels ultra absorption" and "120 Softgels Dietary Supplement". The pouch design is clean, minimal, white background with brown and earth-tone accents. The pouch has a resealable zip top and stands upright on its own`;

const IMAGES = [
  {
    file: 'nattovia-ugc-female-1.png',
    prompt: `A casual authentic smartphone-quality photo of a 70-year-old Caucasian white woman with short silver-gray curly hair, wearing a light yellow casual top, standing in a warm cozy home doorway with wooden door frame and bookshelves visible behind her. She is smiling warmly and genuinely at the camera, holding up ${POUCH}. She holds the pouch with both hands in front of her chest, the front label fully visible and facing the camera. The pouch is about the size of a paperback book in her hands. Warm tungsten indoor home lighting, slight grain, casual amateur photo feel like a real customer selfie. No studio lighting, no professional setup. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-2.png',
    prompt: `A casual authentic smartphone-quality photo of an 80-year-old Caucasian white woman with white curly hair, wearing a soft mint green sweater, sitting in a floral-patterned armchair in her traditional bright living room with paintings on the wall. She is laughing with genuine joy, a big happy smile, holding up ${POUCH}. She holds the pouch with both hands so the front label is fully visible and facing the camera. Natural window light from the right. Casual amateur photo quality, not professional, like a family member took the photo. The pouch looks realistic and proportional in her hands. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-3.png',
    prompt: `A casual authentic smartphone-quality photo of a 65-year-old Caucasian white woman with short gray hair and reading glasses, wearing a plain gray v-neck t-shirt, standing on the front porch of her suburban American home. A blue front door and green bushes are visible behind her. She is smiling warmly at the camera, holding up ${POUCH} with both hands in front of her chest so the front label is clearly visible and facing the camera. Bright natural outdoor daylight, slightly overcast sky. Casual amateur smartphone photo feel, real customer testimonial style. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-4.png',
    prompt: `A casual authentic smartphone-quality photo of a 60-year-old Caucasian white woman with shoulder-length auburn-brown hair and reading glasses, wearing a navy blue cardigan over a white top, standing at her bright modern kitchen counter with floating shelves and a small potted plant behind her. She is smiling at the camera, holding up ${POUCH} with one hand at chest level, the front label clearly facing the camera. Bright natural daylight from a kitchen window. Casual amateur photo feel, real customer at home. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-1.png',
    prompt: `A casual authentic smartphone-quality photo of a 68-year-old Caucasian white man with gray-white hair and a trimmed white beard, wearing a casual blue denim button-down shirt, sitting in a modern light gray armchair in his living room. He is holding ${POUCH} in one hand showing the front label to the camera, while with his other hand he holds a small golden amber softgel capsule near his mouth as if about to take it, smiling. A floor lamp and side table visible in background. Warm natural indoor lighting, casual amateur photo quality. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-2.png',
    prompt: `A casual authentic smartphone-quality photo of a 72-year-old Caucasian white man with thinning gray hair and glasses, wearing a brown fleece pullover, sitting at a wooden dining table in the evening. He rests his chin on both hands with elbows on the table, smiling contentedly at the camera. ${POUCH} stands upright on the table directly in front of him, front label clearly visible and facing the camera. A glass of water on a coaster nearby. Warm yellow-toned evening lamp lighting, cozy home dining room. Casual amateur smartphone photo quality. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-3.png',
    prompt: `A casual authentic smartphone-quality photo of a 62-year-old Caucasian white man with short silver-gray hair, clean shaven, wearing a teal blue crewneck sweater, standing in a bright living room with white built-in bookshelves and hardwood floors behind him. He is smiling happily at the camera, holding up ${POUCH} with one hand in front of his chest, front label clearly visible and facing the camera. Bright natural daylight. Casual, upscale but relaxed home interior. Amateur smartphone photo quality. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-4.png',
    prompt: `A casual authentic smartphone-quality photo of a 78-year-old Caucasian white man with white hair, wearing a light casual polo shirt, sitting in a beige upholstered armchair in his comfortable living room. He is giving a big enthusiastic thumbs up with one hand while holding up ${POUCH} with his other hand, front label clearly facing the camera. He has a very happy, satisfied grin. Bright natural daylight, a sofa and coffee table visible behind him. Casual amateur smartphone photo quality, real happy customer. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-5.png',
    prompt: `A casual authentic smartphone-quality photo of a 58-year-old Caucasian white man with salt-and-pepper gray hair, wearing red-framed glasses and a gray turtleneck sweater, sitting at a small round table in a trendy urban cafe with hanging pendant lights and potted plants visible in the background. He has his arms casually crossed, smiling confidently at the camera. ${POUCH} stands upright on the cafe table in front of him, front label clearly visible and facing the camera. Natural daylight mixed with warm cafe ambient lighting. Casual amateur smartphone photo quality. No text overlay, no watermarks.`,
  },
];

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Generating ${IMAGES.length} UGC customer photos...\n`);
  let ok = 0;
  for (let i = 0; i < IMAGES.length; i++) {
    const img = IMAGES[i];
    console.log(`[${i+1}/${IMAGES.length}] ${img.file}`);
    try {
      const p = await generate(img.prompt, img.file);
      console.log(`  OK: ${p}\n`);
      ok++;
    } catch (e) {
      console.error(`  FAIL: ${e.message}\n`);
    }
    if (i < IMAGES.length - 1) await sleep(2000);
  }
  console.log(`\nDone! ${ok}/${IMAGES.length} succeeded.`);
})();
