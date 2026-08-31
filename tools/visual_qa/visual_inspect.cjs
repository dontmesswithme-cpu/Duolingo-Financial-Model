// Universal Visual QA & Region Inspection Utility (Sharp-based)
// Usage: node tools/visual_qa/visual_inspect.cjs <imagePath>

const fs = require('fs');
const path = require('path');

async function inspectImage(imagePath) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.warn('[Visual QA] Sharp library not installed. Install with `npm i -D sharp` for pixel analysis.');
    return;
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`File not found: ${imagePath}`);
    return;
  }

  const meta = await sharp(imagePath).metadata();
  console.log(`Image: ${imagePath}`);
  console.log(`Resolution: ${meta.width} x ${meta.height}`);
  console.log(`Channels: ${meta.channels}, Format: ${meta.format}`);
  console.log(`Density: ${meta.density || 'default'}`);
}

const target = process.argv[2];
if (target) {
  inspectImage(target);
} else {
  console.log('Provide an image path to inspect: node tools/visual_qa/visual_inspect.cjs <imagePath>');
}
