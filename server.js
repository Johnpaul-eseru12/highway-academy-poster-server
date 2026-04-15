const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { readPsd, writePsd } = require('ag-psd');
const JSZip = require('jszip');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '200mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Highway Academy Poster Server is running' });
});

app.post('/generate', upload.fields([
  { name: 'psd', maxCount: 1 },
  { name: 'logo', maxCount: 1 }
]), async (req, res) => {
  try {
    const psdBuffer = new Uint8Array(req.files['psd'][0].buffer);
    const facultyData = JSON.parse(req.body.facultyData);

    const psd = readPsd(psdBuffer, {
      skipLayerImageData: false,
      skipCompositeImageData: false,
      useImageData: true
    });

    const zip = new JSZip();

    for (const faculty of facultyData) {
      // Update text and color layers
      updateLayers(psd.children, faculty);

      // Write modified PSD back to buffer
      const outBuffer = writePsd(psd);

      // Re-read to get updated composite image
      const outPsd = readPsd(new Uint8Array(outBuffer), {
        skipLayerImageData: true,
        skipCompositeImageData: false
      });

      // Convert composite RGBA to JPG using sharp
      const { width, height } = outPsd;
      const rawData = Buffer.from(outPsd.imageData.data);

      const jpgBuffer = await sharp(rawData, {
        raw: { width, height, channels: 4 }
      })
      .jpeg({ quality: 92 })
      .toBuffer();

      zip.file(`${faculty.name}_poster.jpg`, jpgBuffer);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="posters.zip"');
    res.send(zipBuffer);

  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

function updateLayers(layers, faculty) {
  if (!layers) return;
  for (const layer of layers) {
    const name = (layer.name || '').toLowerCase();

    if (name.includes('faculty color control')) {
      if (layer.children) {
        for (const child of layer.children) {
          if (child.fill && child.fill.color) {
            child.fill.color = hexToRgb(faculty.color);
          }
        }
      }
      if (layer.fill && layer.fill.color) {
        layer.fill.color = hexToRgb(faculty.color);
      }
    } else if (name.includes('website url')) {
      if (layer.text) layer.text.text = faculty.website || '';
    } else if (name.includes('tiktok')) {
      if (layer.text) layer.text.text = faculty.tiktok || '';
    } else if (name.includes('instagram')) {
      if (layer.text) layer.text.text = faculty.instagram || '';
    } else if (name.includes('youtube')) {
      if (layer.text) layer.text.text = faculty.youtube || '';
    } else if (name.includes('twiiter') || name.includes('twitter')) {
      if (layer.text) layer.text.text = faculty.twitter || '';
    } else if (name.includes('facebook')) {
      if (layer.text) layer.text.text = faculty.facebook || '';
    } else if (name.includes('linkedin')) {
      if (layer.text) layer.text.text = faculty.linkedin || '';
    }

    if (layer.children) updateLayers(layer.children, faculty);
  }
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255
  };
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
