const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { readPsd, writePsd, initializeCanvas } = require('ag-psd');
const { createCanvas } = require('canvas');
const JSZip = require('jszip');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Store uploaded PSD in memory (one at a time)
let storedPSD = null;

// Multer — accept PSD upload into memory
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Initialize ag-psd with node-canvas
initializeCanvas(
  (w, h) => createCanvas(w, h),
  (data) => {
    const img = new (require('canvas').Image)();
    img.src = Buffer.from(data);
    const c = createCanvas(img.width || 1, img.height || 1);
    if (img.width) c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }
);

// ── UPLOAD PSD
app.post('/upload-psd', upload.single('psd'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    // Read metadata only to verify it's valid + get layer names
    const psd = readPsd(req.file.buffer, {
      skipCompositeImageData: true,
      skipLinkedFilesData: true,
      skipThumbnail: true,
    });
    storedPSD = req.file.buffer; // store raw buffer
    const layers = flattenLayers(psd.children || []).map(l => l.name);
    res.json({ ok: true, width: psd.width, height: psd.height, layers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GENERATE ONE POSTER
app.post('/generate', async (req, res) => {
  if (!storedPSD) return res.status(400).json({ error: 'No PSD uploaded yet' });
  const { faculty } = req.body;
  if (!faculty) return res.status(400).json({ error: 'No faculty data' });

  try {
    const psd = readPsd(storedPSD, {
      skipCompositeImageData: true,
      skipLinkedFilesData: true,
      skipThumbnail: true,
    });

    // Text layers
    const textMap = {
      'website URL text layer':      faculty.website,
      'TikTok handle text layer':    faculty.tiktok,
      'Instagram handle text layer': faculty.instagram,
      'Youtube handle text layer':   faculty.youtube,
      'Twiiter/X handle layer':      faculty.twitter,
      'Facebook handke text layer':  faculty.facebook,
      'LinkedIn handle text layer':  faculty.linkedin,
    };
    for (const [name, val] of Object.entries(textMap)) {
      const layer = findLayer(psd.children || [], name);
      if (layer && layer.text) layer.text = { ...layer.text, text: val };
    }

    // Color — FACULTY COLOR CONTROL
    const colorLayer = findLayer(psd.children || [], 'FACULTY COLOR CONTROL');
    if (colorLayer) {
      const setColor = (layers) => {
        for (const c of layers) {
          if (c.fill && c.fill.color !== undefined) c.fill = { ...c.fill, color: faculty.rgb };
          if (c.children) setColor(c.children);
        }
      };
      if (colorLayer.fill && colorLayer.fill.color !== undefined)
        colorLayer.fill = { ...colorLayer.fill, color: faculty.rgb };
      else if (colorLayer.children) setColor(colorLayer.children);
      else colorLayer.fill = { color: faculty.rgb };
    }

    // Logo — base64 PNG from client
    if (faculty.logo) {
      const logoLayer = findLayer(psd.children || [], 'Faculty logo layer');
      if (logoLayer) {
        const logoData = faculty.logo.replace(/^data:image\/\w+;base64,/, '');
        const logoBuf = Buffer.from(logoData, 'base64');
        const img = new (require('canvas').Image)();
        img.src = logoBuf;
        const lw = (logoLayer.right || 0) - (logoLayer.left || 0);
        const lh = (logoLayer.bottom || 0) - (logoLayer.top || 0);
        const scale = Math.min(lw / img.width, lh / img.height);
        const dw = Math.round(img.width * scale), dh = Math.round(img.height * scale);
        const c = createCanvas(lw, lh);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, Math.round((lw - dw) / 2), Math.round((lh - dh) / 2), dw, dh);
        logoLayer.canvas = c;
      }
    }

    // Write PSD → read back → composite → PNG buffer
    const outBuf = writePsd(psd);
    const outPsd = readPsd(outBuf, {
      skipCompositeImageData: false,
      skipLinkedFilesData: true,
      skipThumbnail: true,
    });

    const canvas = compositeToCanvas(outPsd, psd.width, psd.height);
    const jpgBuffer = canvas.toBuffer('image/jpeg', { quality: 0.93 });

    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `attachment; filename="POSTER_${faculty.name.replace(/\s+/g, '_')}.jpg"`);
    res.send(jpgBuffer);

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── HELPERS
function flattenLayers(layers) {
  let result = [];
  for (const l of layers) {
    result.push(l);
    if (l.children) result = result.concat(flattenLayers(l.children));
  }
  return result;
}

function findLayer(layers, name) {
  for (const l of layers) {
    if (l.name.trim().toLowerCase() === name.trim().toLowerCase()) return l;
    if (l.children) { const f = findLayer(l.children, name); if (f) return f; }
  }
  return null;
}

function compositeToCanvas(psd, w, h) {
  if (psd.canvas) return psd.canvas;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const layers = flattenLayers(psd.children || []).reverse();
  for (const l of layers) {
    if (l.hidden || !l.canvas) continue;
    ctx.globalAlpha = (l.opacity || 255) / 255;
    ctx.drawImage(l.canvas, l.left || 0, l.top || 0);
  }
  ctx.globalAlpha = 1;
  return c;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Poster server running on port ${PORT}`));
