/**
 * PWA Icon Generator for Talkingo
 * 
 * Generates all required PNG icons from the SVG source.
 * 
 * Usage:
 *   npx tsx scripts/generate-pwa-icons.ts
 * 
 * Requirements:
 *   npm install sharp --save-dev (only needed for icon generation)
 * 
 * Alternatively, use an online tool:
 *   https://realfavicongenerator.net
 *   https://maskable.app/editor
 *   
 * Or use pwa-asset-generator:
 *   npx pwa-asset-generator public/icons/favicon.svg public/icons --padding "15%" --background "#0B1020"
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ICONS_DIR = join(__dirname, '..', 'public', 'icons')

// Standard PWA icon sizes
const STANDARD_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

// Apple touch icon
const APPLE_TOUCH_SIZE = 180

// iOS splash screen sizes (width x height)
const SPLASH_SIZES = [
  { width: 1170, height: 2532, label: 'iPhone 12/13/14' },
  { width: 1284, height: 2778, label: 'iPhone 12/13/14 Pro Max' },
  { width: 1179, height: 2556, label: 'iPhone 14 Pro' },
]

function generateIconSVG(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#0B1020"/>
  <g transform="translate(${size * 0.1}, ${size * 0.1}) scale(${(size * 0.8) / 120})">
    <circle cx="60" cy="60" r="42" fill="none" stroke="#FFD700" stroke-width="4" stroke-opacity="0.4"/>
    <circle cx="102" cy="60" r="10" fill="#FFD700"/>
    <circle cx="60" cy="60" r="22" fill="#FFD700"/>
  </g>
</svg>`
}

function generateMaskableIconSVG(size: number): string {
  // Maskable icons need the safe zone (inner 80%) to contain the logo
  // So we fill the entire background and center the logo
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#0B1020"/>
  <g transform="translate(${size * 0.1}, ${size * 0.1}) scale(${(size * 0.8) / 120})">
    <circle cx="60" cy="60" r="42" fill="none" stroke="#FFD700" stroke-width="4" stroke-opacity="0.4"/>
    <circle cx="102" cy="60" r="10" fill="#FFD700"/>
    <circle cx="60" cy="60" r="22" fill="#FFD700"/>
  </g>
</svg>`
}

function generateSplashSVG(width: number, height: number): string {
  const scale = Math.min(width, height) * 0.25 / 120
  const cx = width / 2 - 60 * scale
  const cy = height / 2 - 80 * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0B1020"/>
  <g transform="translate(${cx}, ${cy}) scale(${scale})">
    <circle cx="60" cy="60" r="42" fill="none" stroke="#FFD700" stroke-width="4" stroke-opacity="0.4"/>
    <circle cx="102" cy="60" r="10" fill="#FFD700"/>
    <circle cx="60" cy="60" r="22" fill="#FFD700"/>
  </g>
  <text x="${width / 2}" y="${height / 2 + 60}" text-anchor="middle" fill="#FFD700" font-family="system-ui, -apple-system, sans-serif" font-size="48" font-weight="700">Talkingo</text>
</svg>`
}

console.log('🎨 Talkingo PWA Icon Generator')
console.log('═'.repeat(50))
console.log('')
console.log('Generating SVG icons (use sharp or online tools for PNG conversion):')
console.log('')

// Generate standard icons
STANDARD_SIZES.forEach(size => {
  const svg = generateIconSVG(size)
  const path = join(ICONS_DIR, `icon-${size}x${size}.svg`)
  writeFileSync(path, svg)
  console.log(`  ✓ icon-${size}x${size}.svg`)
})

// Generate maskable icon
const maskable = generateMaskableIconSVG(512)
writeFileSync(join(ICONS_DIR, 'maskable-icon-512x512.svg'), maskable)
console.log('  ✓ maskable-icon-512x512.svg')

// Generate apple touch icon
const appleTouch = generateIconSVG(APPLE_TOUCH_SIZE)
writeFileSync(join(ICONS_DIR, 'apple-touch-icon.svg'), appleTouch)
console.log('  ✓ apple-touch-icon.svg')

// Generate splash screens
console.log('')
console.log('Splash screens:')
SPLASH_SIZES.forEach(({ width, height, label }) => {
  const svg = generateSplashSVG(width, height)
  const path = join(ICONS_DIR, `splash-${width}x${height}.svg`)
  writeFileSync(path, svg)
  console.log(`  ✓ splash-${width}x${height}.svg (${label})`)
})

console.log('')
console.log('═'.repeat(50))
console.log('')
console.log('⚠️  SVG icons generated. For production, convert to PNG:')
console.log('')
console.log('  Option 1: Use pwa-asset-generator')
console.log('    npx pwa-asset-generator public/icons/favicon.svg public/icons \\')
console.log('      --padding "15%" --background "#0B1020" --type png')
console.log('')
console.log('  Option 2: Use sharp (install: npm i -D sharp)')
console.log('    Then update this script to use sharp for SVG→PNG conversion')
console.log('')
console.log('  Option 3: Use https://realfavicongenerator.net')
console.log('')
