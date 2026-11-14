'use strict';

/**
 * Microphone capture for dictation.
 *
 * Records with MediaRecorder, then decodes through an AudioContext fixed at
 * 16 kHz — decodeAudioData resamples into the context's rate, which is exactly
 * what Whisper wants, so no resampling code of our own is needed.
 *
 * Nothing here sends audio anywhere: the samples go to the main process over
 * IPC and are transcribed on this machine.
 */
const Recorder = (() => {
  const SAMPLE_RATE = 16000;
  const MAX_MS = 60000;            // a dictated task is never a minute long

  let stream = null;
  let recorder = null;
  let chunks = [];
  let audioCtx = null;
  let analyser = null;
  let levelTimer = null;
  let stopTimer = null;

  function recording() {
    return Boolean(recorder && recorder.state === 'recording');
  }

  /** Release the microphone so the OS indicator goes out immediately. */
  function teardown() {
    cancelAnimationFrame(levelTimer);
    clearTimeout(stopTimer);
    levelTimer = null;
    stopTimer = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    analyser = null;
  }

  /**
   * @param {{ onLevel?: (level: number) => void, onAuto?: () => void }} options
   */
  async function start(options = {}) {
    if (recording()) return;
    chunks = [];

    // This is the call that makes macOS ask for microphone permission.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });

    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const v of buffer) peak = Math.max(peak, Math.abs(v - 128));
      if (options.onLevel) options.onLevel(Math.min(1, peak / 70));
      levelTimer = requestAnimationFrame(tick);
    };
    tick();

    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();

    // A forgotten recording should not hold the microphone open forever.
    stopTimer = setTimeout(() => { if (options.onAuto) options.onAuto(); }, MAX_MS);
  }

  /** @returns {Promise<Float32Array|null>} mono 16 kHz samples, or null */
  function stop() {
    return new Promise((resolve) => {
      if (!recorder) return resolve(null);
      const active = recorder;
      recorder = null;

      active.onstop = async () => {
        const blob = new Blob(chunks, { type: active.mimeType || 'audio/webm' });
        chunks = [];
        teardown();
        if (!blob.size) return resolve(null);
        try {
          const decodeCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
          const decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
          const samples = decoded.getChannelData(0).slice();
          decodeCtx.close().catch(() => {});
          resolve(samples.length ? samples : null);
        } catch {
          resolve(null);
        }
      };

      if (active.state !== 'inactive') active.stop();
      else active.onstop();
    });
  }

  function cancel() {
    const active = recorder;
    recorder = null;
    chunks = [];
    if (active && active.state !== 'inactive') {
      active.onstop = null;
      try { active.stop(); } catch { /* already gone */ }
    }
    teardown();
  }

  return { start, stop, cancel, recording, SAMPLE_RATE };
})();

if (typeof window !== 'undefined') window.Recorder = Recorder;
