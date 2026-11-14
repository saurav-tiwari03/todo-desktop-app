'use strict';

/**
 * On-device speech-to-text. Whisper runs in the main process through ONNX
 * Runtime; the renderer only records and hands over raw audio, so nothing
 * here ever touches the network and no audio leaves the machine.
 */

const fs = require('fs');
const path = require('path');

const MODEL = 'Xenova/whisper-base.en';
const SAMPLE_RATE = 16000;

let pipelinePromise = null;
let modelRoot = null;

/** Where the bundled model sits, packed or unpacked. */
function findModels(appPath) {
  const candidates = [
    path.join(appPath, 'models'),
    path.join(appPath, '..', 'models'),
    path.join(__dirname, '..', '..', 'models')
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, MODEL, 'config.json'))) || null;
}

function init(appPath) {
  modelRoot = findModels(appPath);
  return Boolean(modelRoot);
}

function available() {
  return Boolean(modelRoot);
}

/**
 * Loads once and keeps the pipeline warm: the first call pays ~1s, the rest
 * are just inference.
 */
function load() {
  if (pipelinePromise) return pipelinePromise;
  if (!modelRoot) return Promise.reject(new Error('The speech model is not installed.'));

  pipelinePromise = (async () => {
    const { pipeline, env } = require('@huggingface/transformers');
    // Offline, always: look only in the folder we ship.
    env.localModelPath = modelRoot;
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    return pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' });
  })().catch((err) => {
    pipelinePromise = null;          // let a later attempt retry
    throw err;
  });

  return pipelinePromise;
}

/**
 * @param {Float32Array} samples mono PCM at 16 kHz, as the renderer resampled it
 * @returns {Promise<string>}
 */
async function transcribe(samples) {
  if (!samples || !samples.length) return '';
  const asr = await load();
  const out = await asr(samples instanceof Float32Array ? samples : Float32Array.from(samples));
  return String((out && out.text) || '').trim();
}

module.exports = { init, load, available, transcribe, MODEL, SAMPLE_RATE };
