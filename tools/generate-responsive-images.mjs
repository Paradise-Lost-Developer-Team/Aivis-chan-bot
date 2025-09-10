import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

const input = path.resolve('images/aivis-chan-3d.webp');
const outDir = path.resolve('images');
const widths = [400, 600, 800, 1080];

async function ensureOutDir() {
  await fs.mkdir(outDir, { recursive: true });
}

async function run() {
  await ensureOutDir();
  const base = 'aivis-chan-3d';

  for (const w of widths) {
  const pipeline = sharp(input).resize({ width: w, height: w, fit: 'cover' });
    const avifOut = path.join(outDir, `${base}-${w}.avif`);
    const webpOut = path.join(outDir, `${base}-${w}.webp`);

    await pipeline
      .avif({ quality: 40, effort: 6, chromaSubsampling: '4:2:0' })
      .toFile(avifOut);
    await sharp(input)
      .resize({ width: w, height: w, fit: 'cover' })
      .webp({ quality: 60, smartSubsample: true })
      .toFile(webpOut);

    console.log(`generated: ${path.basename(avifOut)} and ${path.basename(webpOut)}`);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
