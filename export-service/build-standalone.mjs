import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

mkdirSync(join(__dirname, 'standalone-dist'), { recursive: true });

await build({
  entryPoints: [join(__dirname, 'src/standalone/render.ts')],
  bundle: true,
  format: 'iife',
  outfile: join(__dirname, 'standalone-dist/render-bundle.js'),
  platform: 'browser',
  target: 'chrome120',
});

copyFileSync(
  join(__dirname, '../node_modules/verovio/dist/verovio-toolkit-wasm.js'),
  join(__dirname, 'standalone-dist/verovio-toolkit-wasm.js')
);
copyFileSync(
  join(__dirname, 'src/standalone/render.html'),
  join(__dirname, 'standalone-dist/render.html')
);

console.log('Standalone build complete -> standalone-dist/');
