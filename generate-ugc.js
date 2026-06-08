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
      const out = path.join(OUTPUT_DIR, 'customers', filename);
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

const PRODUCT_DESC = `a white stand-up supplement pouch bag. The pouch has "Nattovia" written at the top in a dark elegant serif font, below that "nattokinase" in large brown lowercase text, then a small brown oval badge reading "4,000 FU per serving", below that "made with MCT oil" in small text, then a list of ingredients "CoQ10 · bromelain · turmeric · ginger · olive leaf · white willow bark". On the right side are three small circular badges for "GMO free", "gluten free", and "lab tested". The bottom half of the pouch shows an image of pale yellow soybeans. At the very bottom it reads "enteric coated softgels ultra absorption" and "120 Softgels Dietary Supplement". The pouch is white with brown and earth-tone accents, clean minimal design`;

const IMAGES = [
  {
    file: 'nattovia-ugc-female-1.png',
    prompt: `A casual authentic-looking customer photo of a 65-year-old African American woman with short gray curly hair and reading glasses, wearing a yellow striped casual top, standing in a doorway inside her warm cozy home. She is smiling genuinely and holding up ${PRODUCT_DESC}. She holds the pouch with both hands in front of her chest so the front label is clearly visible and readable. Warm indoor tungsten lighting, slightly amateur photo quality like taken with a smartphone. Real customer testimonial photo aesthetic, not overly polished. Authentic, warm, trustworthy feel. The pouch should be approximately 6-7 inches tall in her hands. Shot at eye level, natural pose. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-2.png',
    prompt: `A casual authentic-looking customer photo of an 80-year-old Caucasian woman with white/silver curly hair, wearing a light mint green sweater, sitting in a floral patterned armchair in a bright traditional living room with paintings on the wall behind her. She is laughing joyfully with a big warm smile, holding up ${PRODUCT_DESC}. She holds the pouch with both hands so the front is clearly visible and facing the camera. Bright natural daylight from a window to the right. Slightly amateur smartphone photo quality. Real happy customer testimonial photo. Authentic, genuine joy. The pouch is clearly readable. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-3.png',
    prompt: `A casual authentic-looking customer photo of a 65-year-old African American woman with short gray hair and glasses, wearing a plain gray v-neck t-shirt, standing on the front porch of a suburban American home. Green bushes and a blue front door visible in the background. She is smiling warmly at the camera, holding up ${PRODUCT_DESC} with both hands in front of her chest. Bright outdoor daylight, slightly overcast. Natural amateur smartphone photo quality. Real customer testimonial style. Authentic suburban neighborhood setting. The pouch front label is clearly visible and readable. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-female-4.png',
    prompt: `A casual authentic-looking customer photo of a 58-year-old Caucasian woman with shoulder-length auburn reddish-brown hair and glasses, wearing a blue cardigan over a white top, standing at a bright modern kitchen counter. A small potted plant and floating shelves visible behind her. She is smiling warmly, holding up ${PRODUCT_DESC} with one hand at chest level, front label clearly facing the camera. Bright natural daylight from a nearby window. Clean modern kitchen interior. Slightly casual smartphone photo quality. Real customer testimonial photo style. The pouch is clearly readable. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-1.png',
    prompt: `A casual authentic-looking customer photo of a 68-year-old Caucasian man with gray-white hair and a short white beard, wearing a casual denim blue button-down shirt and khaki pants, sitting in a modern light gray armchair in a cozy living room. He is holding ${PRODUCT_DESC} in one hand while pretending to take a small golden softgel capsule with his other hand near his mouth, smiling. A floor lamp and side table visible in the background. Warm natural indoor lighting. Slightly amateur smartphone photo quality. Real customer testimonial photo. Authentic, relaxed, happy customer. The pouch front is clearly visible. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-2.png',
    prompt: `A casual authentic-looking customer photo of a 72-year-old Caucasian man with thinning gray hair and glasses, wearing a brown fleece pullover, sitting at a wooden dining table in the evening. He is resting his chin on both hands with elbows on the table, looking at the camera with a gentle content smile. ${PRODUCT_DESC} is standing upright on the table in front of him, front label clearly visible. A glass of water on a coaster nearby. Warm yellow evening lamp lighting in the background, cozy home dining room. Slightly amateur smartphone photo quality. Real customer at home. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-3.png',
    prompt: `A casual authentic-looking customer photo of a 60-year-old Caucasian man with short gray hair, clean-shaven, wearing a teal blue crewneck sweater, standing in a bright living room with white built-in bookshelves and hardwood floors behind him. He is smiling at the camera and holding up ${PRODUCT_DESC} with one hand in front of his chest, front label clearly visible and facing the camera. Bright natural daylight. Clean, upscale but casual home interior. Slightly casual smartphone photo quality. Real happy customer testimonial photo. The pouch is clearly readable. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-4.png',
    prompt: `A casual authentic-looking customer photo of a 78-year-old Caucasian man with white hair, wearing a light colored casual shirt, sitting in a beige upholstered armchair in a comfortable living room. He is giving a big thumbs up with one hand while holding up ${PRODUCT_DESC} with his other hand, front label clearly facing the camera. He has a very happy, satisfied grin. Bright natural daylight, a sofa and coffee table visible in the background. Slightly amateur smartphone photo quality. Real enthusiastic customer testimonial photo. Authentic joy and satisfaction. The pouch is clearly readable. No text overlay, no watermarks.`,
  },
  {
    file: 'nattovia-ugc-male-5.png',
    prompt: `A casual authentic-looking customer photo of a 55-year-old Caucasian man with salt-and-pepper gray hair, wearing red-framed glasses and a gray turtleneck sweater, sitting at a small round table in a trendy urban cafe. He has his arms crossed casually, smiling confidently at the camera. ${PRODUCT_DESC} is standing upright on the table in front of him. The cafe has hanging pendant lights, plants, and a modern rustic interior. Natural daylight mixed with warm cafe lighting. Slightly casual smartphone photo quality. Real customer in a public setting testimonial photo. The pouch front label is clearly visible. No text overlay, no watermarks.`,
  },
];

(async () => {
  // ensure output dir exists
  const outDir = path.join(OUTPUT_DIR, 'customers');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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
    if (i < IMAGES.length - 1) await sleep(3000);
  }
  console.log(`\nDone! ${ok}/${IMAGES.length} succeeded.`);
})();
