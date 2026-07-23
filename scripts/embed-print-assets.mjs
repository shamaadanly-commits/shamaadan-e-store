import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = fs.readFileSync(path.join(root, 'assets/images/logo.png'));
const font = fs.readFileSync(path.join(root, 'assets/images/iwanzazapersonal-Regular.otf'));

const out = `/**
 * Inline brand assets for print windows (about:blank cannot reliably load /assets URLs).
 * Generated from assets/images — re-run scripts/embed-print-assets.mjs if logo/font change.
 */
export const PRINT_LOGO_DATA_URI = 'data:image/png;base64,${logo.toString('base64')}';
export const PRINT_FONT_DATA_URI = 'data:font/otf;base64,${font.toString('base64')}';
`;

fs.writeFileSync(path.join(root, 'js/shared/print-assets.js'), out);
console.log('Wrote js/shared/print-assets.js', { logo: logo.length, font: font.length });
