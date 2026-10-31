// High-performance real-time RGB Lighting Engine & Keystroke Visualizer for EvoFox Ronin 75%
import { COLOR_PALETTE } from './config.js';

function hslToRgb(h, s, l) {
  let r, g, b;
  h = ((h % 360) + 360) % 360;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue2rgb(h / 360 + 1 / 3);
    g = hue2rgb(h / 360);
    b = hue2rgb(h / 360 - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16) || 0,
    parseInt(clean.substring(2, 4), 16) || 0,
    parseInt(clean.substring(4, 6), 16) || 0
  ];
}

export class KeyboardLightingVisualizer {
  constructor(stageEl, keys) {
    this.stageEl = stageEl;
    this.keys = keys;
    this.keyElements = new Map();
    this.isRunning = false;
    this.rafId = null;

    // Lighting parameters
    this.mode = 1; // 1 = Flow
    this.brightness = 5;
    this.speed = 3;
    this.direction = 0;
    this.colorIndex = 7; // Rainbow by default
    this.customColors = {}; // keyIndex -> hex

    // Side strip underglow parameters
    this.boxlightMode = 1;
    this.boxBrightness = 5;
    this.boxSpeed = 3;

    // Keystroke Interactive State (for reactive modes & clicks)
    this.activeRipples = []; // { x, y, startTime, color }
    this.keyPressStates = new Map(); // keyIndex -> { pressTime, releaseTime, isDown }

    // Auto Demo state for hands-free reactive testing
    this.autoDemo = false;
    this.autoDemoInterval = null;

    this.refreshKeyElements();
  }

  refreshKeyElements() {
    this.keyElements.clear();
    const domKeys = this.stageEl.querySelectorAll('.key-cap');
    domKeys.forEach(el => {
      const idx = parseInt(el.dataset.index, 10);
      const keyData = this.keys.find(k => k.index === idx);
      if (keyData) {
        this.keyElements.set(idx, { el, data: keyData });
      }
    });
  }

  clearEffects() {
    this.activeRipples = [];
    this.keyPressStates.clear();
  }

  updateParams({ mode, brightness, speed, direction, colorIndex, customColors, boxlightMode, boxBrightness, boxSpeed }) {
    if (mode !== undefined && mode !== this.mode) {
      this.mode = mode;
      this.clearEffects(); // Clean up previous mode's ripples and timers
    }
    if (brightness !== undefined) this.brightness = brightness;
    if (speed !== undefined) this.speed = speed;
    if (direction !== undefined) this.direction = direction;
    if (colorIndex !== undefined) this.colorIndex = colorIndex;
    if (customColors !== undefined) this.customColors = customColors;
    if (boxlightMode !== undefined) this.boxlightMode = boxlightMode;
    if (boxBrightness !== undefined) this.boxBrightness = boxBrightness;
    if (boxSpeed !== undefined) this.boxSpeed = boxSpeed;
  }

  setAutoDemo(enabled) {
    this.autoDemo = !!enabled;
    if (this.autoDemoInterval) {
      clearInterval(this.autoDemoInterval);
      this.autoDemoInterval = null;
    }
    if (this.autoDemo) {
      this.triggerAutoDemoKey();
      this.autoDemoInterval = setInterval(() => {
        if (this.isRunning && this.autoDemo) {
          this.triggerAutoDemoKey();
        }
      }, 2200);
    }
  }

  triggerAutoDemoKey() {
    const demoIndices = [76, 10, 40, 9, 13, 21, 15]; // Space, G, Enter, F, J, 5, ESC
    const chosenIdx = demoIndices[Math.floor(Math.random() * demoIndices.length)];
    const key = this.keys.find(k => k.index === chosenIdx) || this.keys[35];
    if (key) {
      this.triggerKeyPress(key.index, key.x, key.y);
      setTimeout(() => this.triggerKeyRelease(key.index), 160);
    }
  }

  /**
   * Called when a key is pressed (either clicked with mouse or pressed on physical keyboard)
   */
  triggerKeyPress(keyIndex, x, y) {
    const now = performance.now();
    this.keyPressStates.set(keyIndex, { pressTime: now, isDown: true });

    // Spawn an expanding ripple for reactive modes (Ripple, Laser, Crossfire)
    const color = this.colorIndex === 7 ? hslToRgb((now * 0.2) % 360, 1, 0.5) : this.getBaseColorRgb();
    this.activeRipples.push({
      x: x !== undefined ? x : 8,
      y: y !== undefined ? y : 3,
      keyIndex,
      startTime: now,
      color
    });

    // Limit ripple queue size to preserve 60 FPS
    if (this.activeRipples.length > 10) {
      this.activeRipples.shift();
    }
  }

  /**
   * Called when key is released
   */
  triggerKeyRelease(keyIndex) {
    const state = this.keyPressStates.get(keyIndex);
    if (state) {
      state.isDown = false;
      state.releaseTime = performance.now();
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const loop = (timestamp) => {
      if (!this.isRunning) return;
      this.renderFrame(timestamp);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.autoDemoInterval) {
      clearInterval(this.autoDemoInterval);
      this.autoDemoInterval = null;
    }
  }

  getBaseColorRgb() {
    if (this.colorIndex >= 0 && this.colorIndex < 7) {
      return hexToRgb(COLOR_PALETTE[this.colorIndex].hex);
    }
    return [56, 189, 248]; // Electric cyan fallback
  }

  renderFrame(t) {
    if (this.keyElements.size === 0) {
      this.refreshKeyElements();
      if (this.keyElements.size === 0) return;
    }

    const bFactor = this.brightness / 5; // 0.2 to 1.0
    const sFactor = 0.4 + this.speed * 0.35; // 0.75 to 2.15
    const isRainbow = this.colorIndex === 7;
    const baseRgb = this.getBaseColorRgb();

    // Clean up finished ripples older than 1.8 seconds
    this.activeRipples = this.activeRipples.filter(r => (t - r.startTime) < 1800);

    // (No side strip on the Ronin 75%: the old underglow halo is not drawn.)

    // If lights off (mode 21)
    if (this.mode === 21) {
      this.keyElements.forEach(({ el }) => {
        el.style.setProperty('--lit', '0');      // backlight off: legends unlit
      });
      return;
    }

    // Per-Key Custom RGB mode (mode 23)
    if (this.mode === 23) {
      this.keyElements.forEach(({ el, data }) => {
        const hex = this.customColors[data.index] || '#000000';   // unpainted = off
        const [r, g, b] = hexToRgb(hex);
        // Shine-through: the LED colour lights the legend and leaks around the cap.
        el.style.setProperty('--glow', `rgb(${r} ${g} ${b})`);
        el.style.setProperty('--lit', bFactor.toFixed(2));
      });
      return;
    }

    // Dynamic Modes (Continuous vs Key-Reactive)
    this.keyElements.forEach(({ el, data }) => {
      const x = data.x;
      const y = data.y;
      const idx = data.index;

      let r = 0, g = 0, b = 0;
      let alpha = 0.35;

      // Keystroke state for tactile feedback
      const keyState = this.keyPressStates.get(idx);
      const isPhysicallyDown = keyState && keyState.isDown;
      const timeSincePress = keyState ? (t - keyState.pressTime) : 99999;

      switch (this.mode) {
        // Mode 1: Flow (Rainbow Stream) — Autonomous Continuous Wave
        case 1: {
          const dirX = this.direction === 0 ? x : (16 - x);
          const hue = (t * 0.15 * sFactor + dirX * 24 + y * 6) % 360;
          [r, g, b] = hslToRgb(hue, 1, 0.5);
          alpha = 0.45;
          break;
        }

        // Mode 2: Starry (Twinkle) — Autonomous Twinkle
        case 2: {
          const spark = Math.sin(t * 0.003 * sFactor + idx * 11.73);
          const active = spark > 0.45 ? (spark - 0.45) / 0.55 : 0;
          if (isRainbow) {
            const hue = (idx * 37 + t * 0.05) % 360;
            [r, g, b] = hslToRgb(hue, 1, 0.5);
          } else {
            [r, g, b] = baseRgb;
          }
          alpha = 0.15 + active * 0.7;
          break;
        }

        // Mode 3: Wave Ripple: Continuous vertical undulating wave ripple
        case 3: {
          const wavePhase = (t * 0.0035 * sFactor) + (y * 0.85);
          const waveVal = 0.5 + 0.5 * Math.sin(wavePhase);
          [r, g, b] = isRainbow ? hslToRgb((wavePhase * 45) % 360, 1, 0.5) : baseRgb;
          alpha = (0.25 + 0.75 * waveVal) * bFactor;
          break;
        }

        // Mode 4: Laser — REACTIVE laser beams shooting across row & column
        case 4: {
          [r, g, b] = isRainbow ? [56, 189, 248] : baseRgb;
          alpha = 0.22 + 0.12 * bFactor;

          for (const rip of this.activeRipples) {
            const elapsedSec = (t - rip.startTime) / 1000;
            if (elapsedSec < 1.1) {
              const beamDistX = elapsedSec * 16 * sFactor;
              const isRowMatch = Math.abs(y - rip.y) < 0.5 && Math.abs(x - rip.x) <= beamDistX;
              const isColMatch = Math.abs(x - rip.x) < 0.5 && Math.abs(y - rip.y) <= (beamDistX * 0.65);

              if (isRowMatch || isColMatch) {
                const laserIntensity = (1 - elapsedSec / 1.1) * 0.95;
                if (laserIntensity > alpha) {
                  alpha = laserIntensity;
                  [r, g, b] = rip.color;
                }
              }
            }
          }
          break;
        }

        // Mode 5: Spectrum Cycle — Autonomous full board morph
        case 5: {
          const hue = (t * 0.06 * sFactor) % 360;
          [r, g, b] = hslToRgb(hue, 1, 0.5);
          alpha = 0.45;
          break;
        }

        // Mode 6: Kaleidoscope — Autonomous geometric rotation
        case 6: {
          const angle = Math.atan2(y - 2.5, x - 8);
          const hue = ((angle * 180 / Math.PI * 3 + t * 0.12 * sFactor) % 360 + 360) % 360;
          [r, g, b] = isRainbow ? hslToRgb(hue, 1, 0.5) : baseRgb;
          alpha = 0.45;
          break;
        }

        // Mode 7: Static (Constant) — Solid illumination
        case 7: {
          [r, g, b] = isRainbow ? [248, 250, 252] : baseRgb;
          alpha = 0.5;
          break;
        }

        // Mode 8: Breathing — Autonomous pulsing
        case 8: {
          const breath = 0.5 + 0.5 * Math.sin(t * 0.003 * sFactor);
          if (isRainbow) {
            const hue = (t * 0.04) % 360;
            [r, g, b] = hslToRgb(hue, 1, 0.5);
          } else {
            [r, g, b] = baseRgb;
          }
          alpha = 0.15 + breath * 0.65;
          break;
        }

        // Mode 9: Cross Flow — Autonomous diagonal streams
        case 9: {
          const hue = ((x + y) * 28 + t * 0.14 * sFactor) % 360;
          [r, g, b] = isRainbow ? hslToRgb(hue, 1, 0.5) : baseRgb;
          alpha = 0.45;
          break;
        }

        // Mode 10: Glancing Light — Autonomous light streaks
        case 10: {
          const streak = Math.sin(x * 0.8 - t * 0.01 * sFactor + y * 1.2);
          const val = Math.max(0, streak);
          [r, g, b] = isRainbow ? hslToRgb((x * 20 + t * 0.1) % 360, 1, 0.5) : baseRgb;
          alpha = 0.18 + val * 0.62;
          break;
        }

        // Mode 11: Trace On Press / Touch Ripple (Snow) — REACTIVE: keys stay calm until pressed!
        case 11: {
          [r, g, b] = isRainbow ? hslToRgb((idx * 35) % 360, 1, 0.5) : baseRgb;
          let activeAlpha = 0.18 + 0.08 * bFactor;
          if (timeSincePress < 1800) {
            const decay = 1 - (timeSincePress / 1800);
            activeAlpha = 0.25 + decay * 0.75;
          }

          // Expanding keystroke ripple waves
          for (const rip of this.activeRipples) {
            const elapsedSec = (t - rip.startTime) / 1000;
            const ringRadius = elapsedSec * 12 * sFactor;
            const dist = Math.hypot(x - rip.x, y - rip.y);
            const delta = Math.abs(dist - ringRadius);
            if (delta < 1.8) {
              const intensity = (1 - delta / 1.8) * Math.max(0, 1 - elapsedSec / 1.6);
              const waveAlpha = intensity * 0.95;
              if (waveAlpha > activeAlpha) {
                activeAlpha = waveAlpha;
                [r, g, b] = rip.color;
              }
            }
          }
          alpha = activeAlpha;
          break;
        }

        // Mode 12: Landscape Scroll
        case 12: {
          const hill = Math.sin(x * 0.5 - t * 0.008 * sFactor) * Math.cos(y * 0.8);
          const intensity = (hill + 1) / 2;
          const hue = (intensity * 120 + t * 0.05) % 360;
          [r, g, b] = isRainbow ? hslToRgb(hue, 1, 0.5) : baseRgb;
          alpha = 0.2 + intensity * 0.55;
          break;
        }

        // Mode 13: Snake — Autonomous snake slither
        case 13: {
          const head = (t * 0.04 * sFactor) % 80;
          const dist = Math.abs((idx % 80) - head);
          const snake = Math.max(0, 1 - dist / 6);
          [r, g, b] = isRainbow ? hslToRgb((head * 15) % 360, 1, 0.5) : baseRgb;
          alpha = 0.16 + snake * 0.75;
          break;
        }

        // Mode 14: Tornado Storm
        case 14: {
          const angle = Math.atan2(y - 2.5, x - 8);
          const dist = Math.hypot(x - 8, y - 2.5);
          const hue = ((angle * 180 / Math.PI + dist * 25 - t * 0.2 * sFactor) % 360 + 360) % 360;
          [r, g, b] = isRainbow ? hslToRgb(hue, 1, 0.5) : baseRgb;
          alpha = 0.45;
          break;
        }

        // Mode 15: Horizontal Impact
        case 15: {
          const pingPong = Math.abs(Math.sin(t * 0.004 * sFactor)) * 16;
          const dist = Math.abs(x - pingPong);
          const impact = Math.max(0, 1 - dist / 2.5);
          [r, g, b] = isRainbow ? hslToRgb((pingPong * 22) % 360, 1, 0.5) : baseRgb;
          alpha = 0.18 + impact * 0.75;
          break;
        }

        // Mode 16: Rainfall
        case 16: {
          const rain = Math.sin(y * 1.5 - t * 0.01 * sFactor + x * 2.3);
          const drop = Math.max(0, rain);
          [r, g, b] = isRainbow ? hslToRgb((x * 30 + t * 0.05) % 360, 1, 0.5) : baseRgb;
          alpha = 0.16 + drop * 0.7;
          break;
        }

        // Mode 17: Rotating Pinwheel
        case 17: {
          const angle = Math.atan2(y - 2.5, x - 8);
          const blades = Math.sin(angle * 4 + t * 0.008 * sFactor);
          const val = Math.max(0, blades);
          [r, g, b] = isRainbow ? hslToRgb((angle * 180 / Math.PI + t * 0.1) % 360, 1, 0.5) : baseRgb;
          alpha = 0.18 + val * 0.65;
          break;
        }

        // Mode 18: Sine Wave
        case 18: {
          const wave = Math.sin(x * 0.7 + t * 0.007 * sFactor);
          const val = (wave + 1) / 2;
          [r, g, b] = isRainbow ? hslToRgb((val * 180 + t * 0.08) % 360, 1, 0.5) : baseRgb;
          alpha = 0.18 + val * 0.65;
          break;
        }

        // Mode 19: Galloping Steed
        case 19: {
          const gallop = Math.sin((x - y) * 1.2 - t * 0.015 * sFactor);
          const active = Math.max(0, gallop);
          [r, g, b] = isRainbow ? hslToRgb((x * 25 + t * 0.1) % 360, 1, 0.5) : baseRgb;
          alpha = 0.18 + active * 0.7;
          break;
        }

        // Mode 20: Crossfire — REACTIVE reticle lines on press
        case 20: {
          [r, g, b] = isRainbow ? [255, 255, 255] : baseRgb;
          alpha = 0.22 + 0.12 * bFactor;

          for (const rip of this.activeRipples) {
            const elapsedSec = (t - rip.startTime) / 1000;
            if (elapsedSec < 0.9) {
              const isCross = Math.abs(x - rip.x) < 0.6 || Math.abs(y - rip.y) < 0.6;
              if (isCross) {
                alpha = Math.max(alpha, (1 - elapsedSec / 0.9) * 0.95);
                [r, g, b] = rip.color;
              }
            }
          }
          break;
        }

        // Mode 128: Music Rhythm Visualizer (Equalizer bounce)
        case 128: {
          const bar = Math.sin(x * 1.1 + t * 0.012 * sFactor);
          const height = (bar + 1) / 2 * 5;
          const isLit = (5 - y) <= height;
          const hue = ((5 - y) * 35 + 180) % 360;
          [r, g, b] = hslToRgb(hue, 1, 0.5);
          alpha = isLit ? 0.85 : 0.15;
          break;
        }

        default:
          [r, g, b] = baseRgb;
          alpha = 0.45;
          break;
      }

      // Tactile physical keypress boost for ALL modes!
      if (isPhysicallyDown || timeSincePress < 150) {
        alpha = Math.min(1.0, alpha + 0.5);
        r = Math.min(255, r + 60);
        g = Math.min(255, g + 60);
        b = Math.min(255, b + 60);
        el.style.transform = 'translateY(2px)';
      } else {
        el.style.transform = '';
      }

      // Brightness scales how strongly the LED shows through the cap.
      const lit = Math.min(1, alpha * 1.35) * (0.3 + 0.7 * bFactor);
      el.style.setProperty('--glow', `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`);
      el.style.setProperty('--lit', lit.toFixed(3));
    });
  }

  renderSideStrips(t, sFactor) {
    // 1. Underglow halo on the main keyboard stage
    const boxFactor = this.boxBrightness / 5;
    const boxSpeedFactor = 0.5 + this.boxSpeed * 0.4;

    // 2. Animate dedicated Side Strip visualizer elements (if present on DOM)
    const stripL = document.getElementById('stripLeft');
    const stripR = document.getElementById('stripRight');
    const haloL = document.getElementById('haloLeft');
    const haloR = document.getElementById('haloRight');

    let leftGrad = '';
    let rightGrad = '';
    let haloColorL = '';
    let haloColorR = '';

    switch (this.boxlightMode) {
      // Mode 1: Ripple Glow — Smooth pulsing ambient underglow wave
      case 1: {
        const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.003 * boxSpeedFactor));
        const hueL = (t * 0.1 * boxSpeedFactor) % 360;
        const hueR = (t * 0.1 * boxSpeedFactor + 60) % 360;
        const [rl, gl, bl] = hslToRgb(hueL, 1, 0.5 * boxFactor * pulse);
        const [rr, gr, br] = hslToRgb(hueR, 1, 0.5 * boxFactor * pulse);

        leftGrad = `linear-gradient(180deg, rgba(${rl},${gl},${bl},0.9), rgba(${rl},${gl},${bl},0.4))`;
        rightGrad = `linear-gradient(180deg, rgba(${rr},${gr},${br},0.9), rgba(${rr},${gr},${br},0.4))`;
        haloColorL = `rgba(${rl},${gl},${bl},${0.7 * pulse})`;
        haloColorR = `rgba(${rr},${gr},${br},${0.7 * pulse})`;
        break;
      }

      // Mode 2: Spectrum Loop — Continuous flowing rainbow gradient
      case 2: {
        const h1 = (t * 0.15 * boxSpeedFactor) % 360;
        const h2 = (h1 + 90) % 360;
        const h3 = (h1 + 180) % 360;
        const [r1, g1, b1] = hslToRgb(h1, 1, 0.5 * boxFactor);
        const [r2, g2, b2] = hslToRgb(h2, 1, 0.5 * boxFactor);
        const [r3, g3, b3] = hslToRgb(h3, 1, 0.5 * boxFactor);

        leftGrad = `linear-gradient(180deg, rgb(${r1},${g1},${b1}), rgb(${r2},${g2},${b2}), rgb(${r3},${g3},${b3}))`;
        rightGrad = `linear-gradient(180deg, rgb(${r3},${g3},${b3}), rgb(${r2},${g2},${b2}), rgb(${r1},${g1},${b1}))`;
        haloColorL = `rgb(${r1},${g1},${b1})`;
        haloColorR = `rgb(${r3},${g3},${b3})`;
        break;
      }

      // Mode 3: Dual Chase — Chasing dynamic beam running along side strips
      case 3: {
        const pos = ((t * 0.001 * boxSpeedFactor) % 1) * 100;
        const hue = (t * 0.08 * boxSpeedFactor) % 360;
        const [rc, gc, bc] = hslToRgb(hue, 1, 0.6 * boxFactor);

        leftGrad = `linear-gradient(180deg, #10141d 0%, rgb(${rc},${gc},${bc}) ${pos}%, #10141d 100%)`;
        rightGrad = `linear-gradient(0deg, #10141d 0%, rgb(${rc},${gc},${bc}) ${pos}%, #10141d 100%)`;
        haloColorL = `rgb(${rc},${gc},${bc})`;
        haloColorR = `rgb(${rc},${gc},${bc})`;
        break;
      }

      // Mode 4: Rainbow Pulse — Synchronized pulsing rainbow
      case 4: {
        const pulse = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 0.004 * boxSpeedFactor));
        const hue = (t * 0.06 * boxSpeedFactor) % 360;
        const [rp, gp, bp] = hslToRgb(hue, 1, 0.5 * boxFactor * pulse);

        leftGrad = `rgb(${rp},${gp},${bp})`;
        rightGrad = `rgb(${rp},${gp},${bp})`;
        haloColorL = `rgba(${rp},${gp},${bp},${pulse})`;
        haloColorR = `rgba(${rp},${gp},${bp},${pulse})`;
        break;
      }

      // Mode 5: Rainbow Steady — Solid multi-color static spectrum
      case 5: {
        leftGrad = `linear-gradient(180deg, #ff0000, #ffa500, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff)`;
        rightGrad = `linear-gradient(180deg, #ff0000, #ffa500, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff)`;
        haloColorL = `rgba(16, 168, 253, ${0.7 * boxFactor})`;
        haloColorR = `rgba(255, 0, 128, ${0.7 * boxFactor})`;
        break;
      }

      // Mode 6: Skyward Flash — Energetic upward flashing pulses
      case 6: {
        const flash = Math.pow(Math.abs(Math.sin(t * 0.008 * boxSpeedFactor)), 3);
        const hue = (t * 0.2) % 360;
        const [rf, gf, bf] = hslToRgb(hue, 1, 0.6 * boxFactor * flash);

        leftGrad = `linear-gradient(0deg, rgb(${rf},${gf},${bf}), transparent)`;
        rightGrad = `linear-gradient(0deg, rgb(${rf},${gf},${bf}), transparent)`;
        haloColorL = `rgba(${rf},${gf},${bf},${flash})`;
        haloColorR = `rgba(${rf},${gf},${bf},${flash})`;
        break;
      }

      default: {
        leftGrad = `rgb(16, 168, 253)`;
        rightGrad = `rgb(16, 168, 253)`;
        haloColorL = `rgba(16, 168, 253, 0.5)`;
        haloColorR = `rgba(16, 168, 253, 0.5)`;
        break;
      }
    }

    if (stripL && stripR && haloL && haloR) {
      stripL.style.background = leftGrad;
      stripR.style.background = rightGrad;
      stripL.style.boxShadow = `0 0 15px ${haloColorL}, inset 0 0 6px rgba(255,255,255,0.4)`;
      stripR.style.boxShadow = `0 0 15px ${haloColorR}, inset 0 0 6px rgba(255,255,255,0.4)`;

      haloL.style.background = haloColorL;
      haloR.style.background = haloColorR;
      haloL.style.opacity = `${0.65 * boxFactor}`;
      haloR.style.opacity = `${0.65 * boxFactor}`;
    }

    // Keyboard stage ambient halo
    const hueStageL = (t * 0.12 * sFactor) % 360;
    const hueStageR = (t * 0.12 * sFactor + 180) % 360;
    const [rl, gl, bl] = hslToRgb(hueStageL, 1, 0.5 * boxFactor);
    const [rr, gr, br] = hslToRgb(hueStageR, 1, 0.5 * boxFactor);

    this.stageEl.style.boxShadow = `
      -10px 0 25px rgba(${rl}, ${gl}, ${bl}, 0.45),
      10px 0 25px rgba(${rr}, ${gr}, ${br}, 0.45),
      inset 0 2px 10px rgba(0,0,0,0.8),
      0 8px 30px rgba(0,0,0,0.5)
    `;
  }
}
