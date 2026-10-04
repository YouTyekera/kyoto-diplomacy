// Original, deterministic synthesized sounds. No downloaded or sampled material.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = new URL('../apps/web/public/audio/sfx/', import.meta.url);
const sampleRate = 22050;
const sounds = {
  select: { duration: .065, notes: [[0, .055, 680, .35]] },
  'order-confirm': { duration: .13, notes: [[0, .065, 520, .3], [.055, .065, 780, .32]] },
  march: { duration: .32, notes: [[.01, .09, 130, .36], [.17, .09, 155, .28]] },
  'support-success': { duration: .2, notes: [[0, .13, 440, .22], [.06, .13, 660, .26]] },
  'sc-capture': { duration: .3, notes: [[0, .14, 523.25, .27], [.07, .16, 659.25, .24], [.14, .15, 783.99, .23]] },
  standoff: { duration: .18, notes: [[0, .15, 196, .3], [.025, .14, 207.65, .2]] },
  victory: { duration: .9, notes: [[0, .32, 392, .23], [.18, .32, 523.25, .24], [.36, .32, 659.25, .22], [.54, .34, 783.99, .23]] },
};
await mkdir(directory, { recursive: true });
for (const [name, { duration, notes }] of Object.entries(sounds)) {
  const samples = Math.round(duration * sampleRate), wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  let peak = 0, energy = 0;
  for (let i = 0; i < samples; i++) {
    const time = i / sampleRate;
    let value = 0;
    for (const [start, length, frequency, gain] of notes) {
      const t = time - start;
      if (t < 0 || t >= length) continue;
      // Smooth onset, decaying body, and zero endpoints prevent clicks (also at loop boundaries).
      const envelope = Math.sin(Math.PI * t / length) ** 2 * Math.exp(-3 * t / length);
      value += gain * envelope * (Math.sin(2 * Math.PI * frequency * t) + .2 * Math.sin(4 * Math.PI * frequency * t));
    }
    peak = Math.max(peak, Math.abs(value)); energy += value * value;
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
  }
  const normalize = .42 / Math.max(.001, peak);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(wav.readInt16LE(44 + i * 2) * normalize), 44 + i * 2);
  await writeFile(new URL(`${name}.wav`, directory), wav);
  console.log(`${name}.wav: ${Math.round(duration * 1000)}ms, ${wav.length} bytes, peak=0.420, RMS=${(Math.sqrt(energy / samples) * normalize).toFixed(3)}`);
}
console.log(`Generated locally: ${fileURLToPath(directory)}`);
