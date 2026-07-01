/**
 * Creates PNG icons from SVG using the built-in Node.js capabilities.
 * This uses a canvas-free approach by embedding SVG data into PNG format.
 * 
 * For the best quality, use: npx pwa-asset-generator
 * This script creates placeholder PNGs that work for development/testing.
 * 
 * Run: node scripts/create-png-icons.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

// Generate SVG content for each size
function getIconSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#0B1020"/>
  <g transform="translate(${size * 0.1}, ${size * 0.1}) scale(${(size * 0.8) / 120})">
    <circle cx="60" cy="60" r="42" fill="none" stroke="#FFD700" stroke-width="4" stroke-opacity="0.4"/>
    <circle cx="102" cy="60" r="10" fill="#FFD700"/>
    <circle cx="60" cy="60" r="22" fill="#FFD700"/>
  </g>
</svg>`;
}

function getMaskableSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0B1020"/>
  <g transform="translate(${size * 0.1}, ${size * 0.1}) scale(${(size * 0.8) / 120})">
    <circle cx="60" cy="60" r="42" fill="none" stroke="#FFD700" stroke-width="4" stroke-opacity="0.4"/>
    <circle cx="102" cy="60" r="10" fill="#FFD700"/>
    <circle cx="60" cy="60" r="22" fill="#FFD700"/>
  </g>
</svg>`;
}

console.log('Creating PWA icon SVGs...');
console.log('');

// Write standard icons as SVG (browsers support SVG in manifest)
sizes.forEach(size => {
  const svg = getIconSVG(size);
  const filename = size === 180 ? 'apple-touch-icon.svg' : `icon-${size}x${size}.svg`;
  fs.writeFileSync(path.join(ICONS_DIR, filename), svg);
  console.log(`  ✓ ${filename}`);
});

// Maskable icon
const maskable = getMaskableSVG(512);
fs.writeFileSync(path.join(ICONS_DIR, 'maskable-icon-512x512.svg'), maskable);
console.log('  ✓ maskable-icon-512x512.svg');

console.log('');
console.log('Now attempting PNG conversion...');

// Try to use sharp if available
try {
  require.resolve('sharp');
  const sharp = require('sharp');
  
  const promises = sizes.map(async (size) => {
    const svg = Buffer.from(getIconSVG(size));
    const filename = size === 180 ? 'apple-touch-icon.png' : `icon-${size}x${size}.png`;
    await sharp(svg).resize(size, size).png().toFile(path.join(ICONS_DIR, filename));
    console.log(`  ✓ ${filename} (PNG)`);
  });

  // Maskable
  promises.push(
    sharp(Buffer.from(getMaskableSVG(512)))
      .resize(512, 512)
      .png()
      .toFile(path.join(ICONS_DIR, 'maskable-icon-512x512.png'))
      .then(() => console.log('  ✓ maskable-icon-512x512.png (PNG)'))
  );

  Promise.all(promises).then(() => {
    console.log('');
    console.log('✅ All PNG icons generated successfully!');
  });
} catch (e) {
  console.log('');
  console.log('⚠️  sharp not installed. SVG icons created but PNG conversion skipped.');
  console.log('');
  console.log('To generate PNGs, either:');
  console.log('  1. npm install -D sharp && node scripts/create-png-icons.js');
  console.log('  2. npx pwa-asset-generator public/icons/favicon.svg public/icons');
  console.log('  3. Use https://realfavicongenerator.net');
  console.log('');
  console.log('For now, updating manifest.json to use SVG icons (supported by modern browsers)...');
  
  // Update manifest to use SVG icons since we don't have PNGs
  const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  manifest.icons = sizes
    .filter(s => s !== 180)
    .map(size => ({
      src: `/icons/icon-${size}x${size}.svg`,
      sizes: `${size}x${size}`,
      type: 'image/svg+xml',
      purpose: 'any'
    }));
  
  manifest.icons.push({
    src: '/icons/maskable-icon-512x512.svg',
    sizes: '512x512',
    type: 'image/svg+xml',
    purpose: 'maskable'
  });

  // Also keep the SVG favicon as a fallback
  manifest.icons.unshift({
    src: '/icons/favicon.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any'
  });

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('  ✓ manifest.json updated to use SVG icons');
}
