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

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Highway Academy Poster Server is running' });
});

// Generate posters
app.post('/generate', upload.fields([
  { name: 'psd', maxCount: 1 },
  { name: 'logo', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Generate request received');

    if (!req.files || !req.files['psd']) {
      return res.status(400).json({ error: 'No PSD file uploaded' });
    }

    if (!req.body.facultyData) {
      return res.status(400).json({ error: 'No faculty data provided' });
    }

    const psdBuffer = new Uint8Array(req.files['psd'][0].buffer);
    console.log('PSD buffer size:', psdBuffer.length);

    const facultyData = JSON.parse(req.body.facultyData);
    console.log('Faculties to process:', facultyData.length);

    // Read PSD once
    console.log('Reading PSD...');
    const psd = readPsd(psdBuffer, {
      skipLayerImageData: false,
      skipCompositeImageData: false,
      useImageData: true
    });
    console.log('PSD read. Size:', psd.width, 'x', psd.height);
    console.log('Has imageData:', !!psd.imageData);

    const zip = new JSZip();

    for (const faculty of facultyData) {
      console.log('Processing faculty:', faculty.name);

      // Update layers for this faculty
      updateLayers(psd.children, faculty);

      // Write updated PSD to buffer
      console.log('Writing PSD for:', faculty.name);
      const outBuffer = writePsd(psd);

      // Re-read to get fresh composite image
      console.log('Re-reading PSD for composite...');
      const outPsd = readPsd(new Uint8Array(outBuffer), {
        skipLayerImageData: true,
        skipCompositeImageData: false,
        useImageData: true
      });

      if (!outPsd.imageData) {
        console.error('No imageData in output PSD for:', faculty.name);
        continue;
      }

      const { width, height } = outPsd;
      console.log('Converting to JPG. Size:', width, 'x', height);

      const rawData = Buffer.from(outPsd.imageData.data.buffer);

      const jpgBuffer = await sharp(rawData, {
        raw: { width, height, channels: 4 }
      })
      .jpeg({ quality: 92 })
      .toBuffer();

      console.log('JPG created for:', faculty.name, 'Size:', jpgBuffer.length);
      zip.file(`${faculty.name}_poster.jpg`, jpgBuffer);
    }

    console.log('Generating ZIP...');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    console.log('ZIP ready. Size:', zipBuffer.length);

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="posters.zip"');
    res.send(zipBuffer);

  } catch (err) {
    console.error('Generate error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      type: err.constructor.name
    });
  }
});

function updateLayers(layers, faculty) {
  if (!layers) return;

  for (const layer of layers) {
    const name = (layer.name || '').toLowerCase().trim();
    console.log('Checking layer:', layer.name);

    if (name.includes('faculty color control')) {
      console.log('Found color layer for:', faculty.name);
      if (layer.fill && layer.fill.color) {
        layer.fill.color = hexToRgb(faculty.color);
      }
      if (layer.children) {
        for (const child of layer.children) {
          if (child.fill && child.fill.color) {
            child.fill.color = hexToRgb(faculty.color);
          }
        }
      }

    } else if (name.includes('website url')) {
      console.log('Found website layer');
      if (layer.text) layer.text.text = faculty.website || '';

    } else if (name.includes('tiktok')) {
      console.log('Found tiktok layer');
      if (layer.text) layer.text.text = faculty.tiktok || '';

    } else if (name.includes('instagram')) {
      console.log('Found instagram layer');
      if (layer.text) layer.text.text = faculty.instagram || '';

    } else if (name.includes('youtube')) {
      console.log('Found youtube layer');
      if (layer.text) layer.text.text = faculty.youtube || '';

    } else if (name.includes('twiiter') || name.includes('twitter')) {
      console.log('Found twitter layer');
      if (layer.text) layer.text.text = faculty.twitter || '';

    } else if (name.includes('facebook')) {
      console.log('Found facebook layer');
      if (layer.text) layer.text.text = faculty.facebook || '';

    } else if (name.includes('linkedin')) {
      console.log('Found linkedin layer');
      if (layer.text) layer.text.text = faculty.linkedin || '';
    }

    // Recurse into groups
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
