/**
 * Renders the PWA icons from the SVG sources in assets/brand/.
 *
 *   npm run icons
 *
 * The PNGs are committed, so CI and a fresh clone never need to run this. Run it again only
 * after editing one of the SVGs.
 *
 *   icon.svg           rounded tile, used where the icon is shown as it is
 *   icon-maskable.svg  the same glyph on a full-bleed background: Android crops this one to the
 *                      launcher's shape, so the glyph stays inside the central safe zone
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const source = (name: string) => new URL(`assets/brand/${name}`, root);
const output = (name: string) => new URL(`public/${name}`, root);

const targets = [
  { from: 'icon.svg', to: 'icons/icon-192.png', size: 192 },
  { from: 'icon.svg', to: 'icons/icon-512.png', size: 512 },
  { from: 'icon-maskable.svg', to: 'icons/maskable-512.png', size: 512 },
  // iOS rounds the corners itself and shows transparency as black, so it gets the full bleed.
  { from: 'icon-maskable.svg', to: 'icons/apple-touch-icon.png', size: 180 },
];

await mkdir(output('icons/'), { recursive: true });

for (const { from, to, size } of targets) {
  const svg = await readFile(source(from));
  await sharp(svg, { density: 144 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(output(to).pathname);
  console.log(`${to}  ${size}×${size}`);
}

await copyFile(source('icon.svg'), output('favicon.svg'));
console.log('favicon.svg');
