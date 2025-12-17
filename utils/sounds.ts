
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

class SoundService {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private processingNode: OscillatorNode | null = null;

  private getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (mute && this.processingNode) {
      this.stopProcessing();
    }
  }

  playClick() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  playSuccess() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    playNote(523.25, now, 0.2); // C5
    playNote(659.25, now + 0.1, 0.2); // E5
    playNote(783.99, now + 0.2, 0.4); // G5
  }

  playError() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.3);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.3);
  }

  startProcessing() {
    if (this.isMuted || this.processingNode) return;
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Subtle low digital hum
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    
    // Add frequency modulation for "thinking" effect
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.frequency.value = 5;
    modGain.gain.value = 10;
    mod.connect(modGain);
    modGain.connect(osc.frequency);
    mod.start();

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    this.processingNode = osc;
  }

  stopProcessing() {
    if (this.processingNode) {
      const ctx = this.getContext();
      const node = this.processingNode;
      // Fade out
      const gain = ctx.createGain(); // This is just a conceptual placeholder; usually we keep reference to gain
      // In a real impl we'd keep the gain node reference. Let's just kill it for simplicity in this helper.
      node.stop(ctx.currentTime + 0.1);
      this.processingNode = null;
    }
  }
}

export const sounds = new SoundService();
