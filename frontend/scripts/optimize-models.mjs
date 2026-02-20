#!/usr/bin/env node
/**
 * optimize-models.mjs — GLB optimization pipeline for manually sourced 3D models.
 *
 * Takes raw GLBs from `frontend/raw-models/` and produces optimized versions
 * in `public/models/drones/` (or other category directories).
 *
 * Pipeline:
 *   1. Resize textures to 512×512
 *   2. Compress textures to WebP format
 *   3. Simplify geometry if over 5,000 triangles (ratio 0.5)
 *   4. Apply Draco compression
 *
 * Usage:
 *   node scripts/optimize-models.mjs
 *   npm run optimize-models
 *
 * Input:  raw-models/*.glb  (or raw-models/{category}/*.glb)
 * Output: public/models/drones/*.glb  (drop-in replacement)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  textureCompress,
  weld,
  simplify,
  draco,
  dedup,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';

// sharp is a transitive dep of @gltf-transform — import dynamically
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('⚠ sharp not found — texture resize/compress will be skipped');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '..', 'raw-models');
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'models', 'drones');

const MAX_TEXTURE_SIZE = 512;
const SIMPLIFY_TRIANGLE_THRESHOLD = 5000;
const SIMPLIFY_RATIO = 0.5;

async function getTriangleCount(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) {
        total += indices.getCount() / 3;
      } else {
        const pos = prim.getAttribute('POSITION');
        if (pos) total += pos.getCount() / 3;
      }
    }
  }
  return Math.round(total);
}

async function optimizeModel(inputPath, outputPath) {
  const filename = path.basename(inputPath);
  const beforeSize = fs.statSync(inputPath).size;

  // Set up IO with all extensions
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });

  const document = await io.read(inputPath);
  const beforeTris = await getTriangleCount(document);

  // 1. Dedup identical accessors/textures
  await document.transform(dedup());

  // 2. Resize textures to max 512×512 and compress to WebP
  const textures = document.getRoot().listTextures();
  if (textures.length > 0 && sharp) {
    // Manually resize oversized textures via sharp
    for (const texture of textures) {
      const image = texture.getImage();
      if (!image) continue;
      try {
        const metadata = await sharp(Buffer.from(image)).metadata();
        if (metadata.width > MAX_TEXTURE_SIZE || metadata.height > MAX_TEXTURE_SIZE) {
          const resized = await sharp(Buffer.from(image))
            .resize(MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE, { fit: 'inside' })
            .png()
            .toBuffer();
          texture.setImage(new Uint8Array(resized));
          texture.setMimeType('image/png');
        }
      } catch { /* skip textures that can't be processed */ }
    }

    // Compress textures to WebP
    try {
      await document.transform(textureCompress({ encoder: sharp, targetFormat: 'webp' }));
    } catch (e) {
      console.warn(`  ⚠ WebP compression skipped for ${filename}: ${e.message}`);
    }
  }

  // 4. Weld vertices before simplification
  await document.transform(weld());

  // 5. Simplify geometry if over threshold
  if (beforeTris > SIMPLIFY_TRIANGLE_THRESHOLD) {
    await MeshoptSimplifier.ready;
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY_RATIO, error: 0.01 })
    );
  }

  // 6. Apply Draco compression
  await document.transform(draco());

  // Write output
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await io.write(outputPath, document);

  const afterSize = fs.statSync(outputPath).size;
  const afterTris = await getTriangleCount(document);
  const savings = ((1 - afterSize / beforeSize) * 100).toFixed(1);

  console.log(
    `  ✓ ${filename}: ${(beforeSize / 1024).toFixed(1)}KB → ${(afterSize / 1024).toFixed(1)}KB ` +
    `(${savings}% smaller), ${beforeTris} → ${afterTris} triangles`
  );
}

async function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.log(`No raw-models/ directory found at ${RAW_DIR}`);
    console.log('Create it and place .glb files there to optimize them.');
    console.log('  mkdir -p frontend/raw-models');
    console.log('  cp ~/Downloads/my-drone.glb frontend/raw-models/quadcopter_phantom.glb');
    console.log('  npm run optimize-models');
    return;
  }

  const files = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.glb'));
  if (files.length === 0) {
    console.log('No .glb files found in raw-models/');
    return;
  }

  console.log(`Optimizing ${files.length} model(s)...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const inputPath = path.join(RAW_DIR, file);
    const outputPath = path.join(OUT_DIR, file);
    try {
      await optimizeModel(inputPath, outputPath);
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\nDone: ${successCount} optimized, ${errorCount} errors.`);
  if (errorCount > 0) process.exit(1);
}

main();
