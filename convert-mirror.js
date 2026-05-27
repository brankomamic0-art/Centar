const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const files = [
  '20240923_144653.jpg',
  '20240926_122117.jpg',
  '20241007_194820.jpg',
  '20241007_194835.jpg',
  'VideoCapture_20241007-193956.jpg'
];

const src = 'C:\\Users\\Branko\\Desktop\\superior\\Mirror terapija-20260521T162337Z-3-001\\Mirror terapija';
const dst = 'C:\\Users\\Branko\\Documents\\GitHub\\Centar\\neuro';

(async () => {
  for (let i = 0; i < files.length; i++) {
    const inputPath = path.join(src, files[i]);
    const outputPath = path.join(dst, `mirror-terapija-0${i+1}.webp`);
    const buf = fs.readFileSync(inputPath);
    const out = await sharp(buf).rotate().webp({ quality: 82 }).toBuffer();
    fs.writeFileSync(outputPath, out);
    console.log('done:', outputPath);
  }
})();
