#!/usr/bin/env node
'use strict';

/**
 * Downloads the speech model into models/, which the build bundles.
 *
 *   npm run fetch-model
 *
 * It is kept out of git (75 MB), so a fresh clone needs this once before
 * `npm run dist`. The app itself never downloads anything: at runtime it only
 * reads what is already in the bundle.
 */

const fs = require('fs');
const path = require('path');

const MODEL = 'Xenova/whisper-base.en';
const BASE = `https://huggingface.co/${MODEL}/resolve/main`;
const OUT = path.join(__dirname, '..', 'models', MODEL);

const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx'
];

async function fetchFile(name) {
  const target = path.join(OUT, name);
  if (fs.existsSync(target)) {
    console.log(`  have  ${name}`);
    return;
  }
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  const mb = (fs.statSync(target).size / 1e6).toFixed(1);
  console.log(`  got   ${name}  (${mb} MB)`);
}

(async () => {
  console.log(`Fetching ${MODEL} into models/`);
  for (const name of FILES) await fetchFile(name);
  console.log('Done.');
})().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
