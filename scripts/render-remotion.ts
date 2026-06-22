// Render the marketing compositions to site/assets (mp4 + poster still).
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const OUT = path.resolve('site/assets');

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log('[remotion] bundling…');
  const serveUrl = await bundle({ entryPoint: path.resolve('remotion/index.ts') });

  for (const id of ['Hero', 'FrameworkTicker']) {
    console.log(`[remotion] rendering ${id}…`);
    const composition = await selectComposition({ serveUrl, id });
    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      outputLocation: path.join(OUT, `oakattest-${id.toLowerCase()}.mp4`),
    });
  }

  console.log('[remotion] rendering poster…');
  const hero = await selectComposition({ serveUrl, id: 'Hero' });
  await renderStill({
    serveUrl,
    composition: hero,
    frame: 390,
    output: path.join(OUT, 'oakattest-hero-poster.png'),
  });

  console.log('[remotion] done →', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
