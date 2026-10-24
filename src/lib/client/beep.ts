"use client";

let ctx: AudioContext | null = null;

// A short beep after a scan: high = item found, low = problem. Sound is only a convenience:
// a browser may block it until the page has been clicked, and any failure is ignored.
export function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx ??= new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
  } catch {
    // ignore
  }
}

// Same gap Odoo's barcode app uses: a second scan within 100 ms is an accidental double read.
export const MIN_SCAN_GAP_MS = 100;
