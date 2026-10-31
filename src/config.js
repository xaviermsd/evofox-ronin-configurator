// Hardware definitions for the EvoFox Ronin Wireless (75% / "Ronin TKL", 79 keys).
// Verified against the official EvoFox driver and the Amkette quick start guide.
export const DEVICE_CONFIG = {
  vendorId: 0x1A2C,
  models: [
    { mode: 'USB', productId: 0xA157, name: 'EvoFox Ronin (Wired USB)' },
    { mode: '2.4G', productId: 0x8FF0, name: 'EvoFox Ronin (2.4G Wireless Dongle)' }
  ],
  usagePage: 0xFF02,
  usage: 0x0002,
  reportSize: 64, // 64 payload bytes + 1 report ID = 65 bytes
  magicHeader: [0xAA, 0x55, 0xCC, 0x33], // [170, 85, 204, 51]
  opcodes: {
    SET_MACRO_KEY_BLOCK: 0x00, // 0..2 for 54-byte blocks
    SET_KEY_REMAP: 0x04,
    LIGHT_OFF_ALT: 0x05,
    SET_LIGHT_MODE: 0x07,
    FACTORY_RESET: 0x08,
    SAVE_CUSTOM_LIGHT: 0x0A,
    SET_CUSTOM_LIGHT_INIT: 0x0B,
    SET_SLEEP_TIMEOUT: 0x0C,
    SET_RESPONSE_RATE: 0x0D,
    GET_STATUS_BATTERY: 0x0E,
    CLEAR_ALL_MACROS: 0x0F,
    SET_FN_LAYER_MODE: 0x10,
    AURORA_GET_LIGHT: 0x12,
    AURORA_SET_LIGHT: 0xF0, // 0xF0..0xF5
    CUSTOM_RGB_BLOCK: 0xF6  // 0xF6..0xFB
  }
};

// Colour presets for colour-capable effects (byte 10). Values from the
// official EvoFox driver for this keyboard. These are hardware colours
// (user content), not theme colours.
export const COLOR_PALETTE = [
  { index: 0, name: 'Red', hex: '#FF0000' },
  { index: 1, name: 'Green', hex: '#00FF00' },
  { index: 2, name: 'Blue', hex: '#0000FF' },
  { index: 3, name: 'Yellow', hex: '#FFFF00' },
  { index: 4, name: 'Magenta', hex: '#FF00FF' },
  { index: 5, name: 'Cyan', hex: '#00FFFF' },
  { index: 6, name: 'White', hex: '#FFFFFF' },
  { index: 7, name: 'Multicolour', hex: 'linear-gradient(135deg, #FF0000 0%, #00FF00 25%, #0000FF 50%, #FFFF00 75%, #FF00FF 100%)' }
];

// Two-colour gradients used only by the Float effect (same byte 10).
export const GRADIENT_PALETTE = [
  { index: 0, name: 'Yellow to red', hex: 'linear-gradient(90deg, #FFFF00, #FF0000)' },
  { index: 1, name: 'Yellow to green', hex: 'linear-gradient(90deg, #FFFF00, #00FF00)' },
  { index: 2, name: 'Purple to blue', hex: 'linear-gradient(90deg, #8800FF, #0000FF)' },
  { index: 3, name: 'Cyan to green', hex: 'linear-gradient(90deg, #00FFFF, #00FF00)' },
  { index: 4, name: 'Cyan to blue', hex: 'linear-gradient(90deg, #00FFFF, #0000FF)' },
  { index: 5, name: 'White to red', hex: 'linear-gradient(90deg, #FFFFFF, #FF0000)' },
  { index: 6, name: 'White to green', hex: 'linear-gradient(90deg, #FFFFFF, #00FF00)' },
  { index: 7, name: 'White to blue', hex: 'linear-gradient(90deg, #FFFFFF, #0000FF)' }
];

// The Ronin's lighting effects, exactly as the official EvoFox driver lists
// them for this keyboard: 20 effects + Custom = the "21 effects" on the box,
// plus Off. Flags say which controls each effect accepts:
//   hasColor = colour preset, hasGradient = gradient preset (Float only).
// No effect takes a direction from software (use Fn + ← on the keyboard).
// "Music Rhythm" (value 128) is left out: it needs Amkette's Windows app.
const fx = (id, name, desc, o = {}) => ({
  id, name, desc,
  hasBrightness: o.brightness ?? true,
  hasSpeed: o.speed ?? true,
  hasColor: o.color ?? true,
  hasGradient: o.gradient ?? false,
  hasDir: false,
  isReactive: o.reactive ?? false
});
export const BACKLIGHT_MODES = [
  fx(1, 'Flow', 'A rainbow stream flows across the keys.'),
  fx(2, 'Starry', 'Keys twinkle at random like stars.', { color: false }),
  fx(3, 'Ripple', 'Ripples move up and down through the rows.'),
  fx(4, 'Laser', 'Reacts to typing: a laser shoots out from the key you press.', { reactive: true }),
  fx(5, 'Spectrum', 'The whole board cycles through the colour spectrum.', { color: false }),
  fx(6, 'Kaleidoscope', 'Colours turn around the centre like a kaleidoscope.'),
  fx(7, 'Static', 'One steady colour on every key.', { speed: false }),
  fx(8, 'Breathing', 'The backlight slowly fades in and out.'),
  fx(9, 'Cross Flow', 'Light streams cross the board diagonally.'),
  fx(10, 'Float', 'A soft two-colour gradient drifts across the keys.', { color: false, gradient: true }),
  fx(11, 'Snow Trace', 'Reacts to typing: keys you press light up and fade like footprints in snow.', { reactive: true }),
  fx(12, 'Scroll', 'Bands of light roll across the board like a scroll painting.'),
  fx(13, 'Snake', 'A snake of light winds through the keys.'),
  fx(14, 'Tornado', 'Light swirls around like a tornado.'),
  fx(15, 'Impact', 'Light bursts bounce between the left and right edges.'),
  fx(16, 'Rain', 'Drops of light fall down the keyboard.'),
  fx(17, 'Windmill', 'Light rotates around the board like windmill blades.'),
  fx(18, 'Sine Wave', 'A smooth wave of light rises and falls.'),
  fx(19, 'Galloping', 'A fast beam of light races along the rows.'),
  fx(20, 'Crossfire', 'Reacts to typing: a cross of light lights up the row and column of the key you press.', { reactive: true }),
  fx(23, 'Custom (per-key)', 'Your own colour on each key, painted in the Custom RGB tab.', { brightness: false, speed: false, color: false }),
  fx(21, 'Off', 'Turns the backlight off.', { brightness: false, speed: false, color: false })
];

export const BOXLIGHT_MODES = [
  { id: 1, name: 'Ripple Glow', desc: 'Subtle ambient underglow pulse' },
  { id: 2, name: 'Spectrum Loop', desc: 'Continuous RGB color loop along side bezels' },
  { id: 3, name: 'Dual Chase', desc: 'Opposing chasing beams along side strips' },
  { id: 4, name: 'Rainbow Pulse', desc: 'Breathing multi-color side lighting' },
  { id: 5, name: 'Rainbow Steady', desc: 'Solid multi-color static side bezel glow' },
  { id: 6, name: 'Skyward Flash', desc: 'Energetic upward flashing light pulses' }
];

// Sleep levels as the official driver defines them (opcode 0x0C, levels 1-4).
// Each level is light sleep (backlight off) then deep sleep.
export const SLEEP_LEVELS = [
  { level: 1, label: 'Light sleep after 2 min, deep sleep after 30 min (recommended)' },
  { level: 2, label: 'Light sleep after 15 min, deep sleep after 40 min' },
  { level: 3, label: 'Light sleep after 30 min, deep sleep after 60 min' },
  { level: 4, label: 'Never sleep' }
];

// Key response levels (opcode 0x0D). Level 1 is the FASTEST.
// Times from the official driver: wired / 2.4 GHz / Bluetooth.
export const RESPONSE_LEVELS = [
  { level: 1, label: 'Level 1 (fastest): wired 2-3 ms, 2.4 GHz 5-6 ms, Bluetooth 12-13 ms' },
  { level: 2, label: 'Level 2: wired 4-5 ms, 2.4 GHz 7-8 ms, Bluetooth 14-15 ms' },
  { level: 3, label: 'Level 3: wired 6-7 ms, 2.4 GHz 9-10 ms, Bluetooth 16-17 ms' }
];

// Fn layer behaviour (opcode 0x10, byte 6).
export const FN_LAYER_MODES = [
  { value: 0, label: 'Hold Fn (normal)' },
  { value: 1, label: 'Press Fn once to switch layers' }
];

// Keys the firmware reserves on the Fn layer for its own shortcuts
// (from the official driver). They can't be remapped on layer 1.
export const FN_LAYER_RESERVED_CODES = [49, 100, 40, 79, 80, 81, 82, 227, 223, 41, 42, 30, 31, 32, 33, 34, 22, 4, 44, 78, 75, 76, 45, 46];

// Physical 79-key matrix layout of the Ronin
// The Ronin's 79-key layout, taken as-is from the official EvoFox driver
// (the same table the official software uses for this keyboard).
// It matches the "Know your keyboard" page of the Amkette quick start guide.
// index = the key's slot in the per-key RGB data, code = its HID usage code.
// Both are hardware values. Only the display names are ours.
export const KEYBOARD_LAYOUT = [
  // Positions match the official Ronin Wireless Quick Start Guide ("Know your keyboard").
  // Units: 1u = one key. Volume knob, EVOFOX logo plate, LED dots and the power switch
  // are not keys and are drawn by the welcome mockup only. Hardware indices are unchanged.

  // Row 0
  { row: 0, col: 0, x: 0, y: 0, w: 1, h: 1, code: 41, index: 15, name: "ESC" },
  { row: 0, col: 1, x: 1.25, y: 0, w: 1, h: 1, code: 58, index: 14, name: "F1" },
  { row: 0, col: 2, x: 2.25, y: 0, w: 1, h: 1, code: 59, index: 13, name: "F2" },
  { row: 0, col: 3, x: 3.25, y: 0, w: 1, h: 1, code: 60, index: 12, name: "F3" },
  { row: 0, col: 4, x: 4.25, y: 0, w: 1, h: 1, code: 61, index: 11, name: "F4" },
  { row: 0, col: 5, x: 5.5, y: 0, w: 1, h: 1, code: 62, index: 10, name: "F5" },
  { row: 0, col: 6, x: 6.5, y: 0, w: 1, h: 1, code: 63, index: 9, name: "F6" },
  { row: 0, col: 7, x: 7.5, y: 0, w: 1, h: 1, code: 64, index: 8, name: "F7" },
  { row: 0, col: 8, x: 8.5, y: 0, w: 1, h: 1, code: 65, index: 7, name: "F8" },
  { row: 0, col: 9, x: 9.75, y: 0, w: 1, h: 1, code: 66, index: 6, name: "F9" },
  { row: 0, col: 10, x: 10.75, y: 0, w: 1, h: 1, code: 67, index: 5, name: "F10" },
  { row: 0, col: 11, x: 11.75, y: 0, w: 1, h: 1, code: 68, index: 4, name: "F11" },
  { row: 0, col: 12, x: 12.75, y: 0, w: 1, h: 1, code: 69, index: 3, name: "F12" },
  { row: 0, col: 13, x: 14, y: 0, w: 1, h: 1, code: 76, index: 43, name: "Del" },

  // Row 1
  { row: 1, col: 0, x: 0, y: 1.35, w: 1, h: 1, code: 53, index: 16, name: "~" },
  { row: 1, col: 1, x: 1, y: 1.35, w: 1, h: 1, code: 30, index: 17, name: "1" },
  { row: 1, col: 2, x: 2, y: 1.35, w: 1, h: 1, code: 31, index: 18, name: "2" },
  { row: 1, col: 3, x: 3, y: 1.35, w: 1, h: 1, code: 32, index: 19, name: "3" },
  { row: 1, col: 4, x: 4, y: 1.35, w: 1, h: 1, code: 33, index: 20, name: "4" },
  { row: 1, col: 5, x: 5, y: 1.35, w: 1, h: 1, code: 34, index: 21, name: "5" },
  { row: 1, col: 6, x: 6, y: 1.35, w: 1, h: 1, code: 35, index: 22, name: "6" },
  { row: 1, col: 7, x: 7, y: 1.35, w: 1, h: 1, code: 36, index: 23, name: "7" },
  { row: 1, col: 8, x: 8, y: 1.35, w: 1, h: 1, code: 37, index: 24, name: "8" },
  { row: 1, col: 9, x: 9, y: 1.35, w: 1, h: 1, code: 38, index: 25, name: "9" },
  { row: 1, col: 10, x: 10, y: 1.35, w: 1, h: 1, code: 39, index: 26, name: "0" },
  { row: 1, col: 11, x: 11, y: 1.35, w: 1, h: 1, code: 45, index: 27, name: "-" },
  { row: 1, col: 12, x: 12, y: 1.35, w: 1, h: 1, code: 46, index: 28, name: "+" },
  { row: 1, col: 13, x: 13, y: 1.35, w: 2, h: 1, code: 42, index: 29, name: "Backspace" },

  // Row 2
  { row: 2, col: 0, x: 0, y: 2.4, w: 1.5, h: 1, code: 43, index: 57, name: "Tab" },
  { row: 2, col: 1, x: 1.5, y: 2.4, w: 1, h: 1, code: 20, index: 56, name: "Q" },
  { row: 2, col: 2, x: 2.5, y: 2.4, w: 1, h: 1, code: 26, index: 55, name: "W" },
  { row: 2, col: 3, x: 3.5, y: 2.4, w: 1, h: 1, code: 8, index: 54, name: "E" },
  { row: 2, col: 4, x: 4.5, y: 2.4, w: 1, h: 1, code: 21, index: 53, name: "R" },
  { row: 2, col: 5, x: 5.5, y: 2.4, w: 1, h: 1, code: 23, index: 52, name: "T" },
  { row: 2, col: 6, x: 6.5, y: 2.4, w: 1, h: 1, code: 28, index: 51, name: "Y" },
  { row: 2, col: 7, x: 7.5, y: 2.4, w: 1, h: 1, code: 24, index: 50, name: "U" },
  { row: 2, col: 8, x: 8.5, y: 2.4, w: 1, h: 1, code: 12, index: 49, name: "I" },
  { row: 2, col: 9, x: 9.5, y: 2.4, w: 1, h: 1, code: 18, index: 48, name: "O" },
  { row: 2, col: 10, x: 10.5, y: 2.4, w: 1, h: 1, code: 19, index: 47, name: "P" },
  { row: 2, col: 11, x: 11.5, y: 2.4, w: 1, h: 1, code: 47, index: 46, name: "[" },
  { row: 2, col: 12, x: 12.5, y: 2.4, w: 1, h: 1, code: 48, index: 45, name: "]" },
  { row: 2, col: 13, x: 13.5, y: 2.4, w: 1.5, h: 1, code: 49, index: 44, name: "\\" },

  // Row 3
  { row: 3, col: 0, x: 0, y: 3.45, w: 1.75, h: 1, code: 57, index: 58, name: "Caps" },
  { row: 3, col: 1, x: 1.75, y: 3.45, w: 1, h: 1, code: 4, index: 59, name: "A" },
  { row: 3, col: 2, x: 2.75, y: 3.45, w: 1, h: 1, code: 22, index: 60, name: "S" },
  { row: 3, col: 3, x: 3.75, y: 3.45, w: 1, h: 1, code: 7, index: 61, name: "D" },
  { row: 3, col: 4, x: 4.75, y: 3.45, w: 1, h: 1, code: 9, index: 62, name: "F" },
  { row: 3, col: 5, x: 5.75, y: 3.45, w: 1, h: 1, code: 10, index: 63, name: "G" },
  { row: 3, col: 6, x: 6.75, y: 3.45, w: 1, h: 1, code: 11, index: 64, name: "H" },
  { row: 3, col: 7, x: 7.75, y: 3.45, w: 1, h: 1, code: 13, index: 65, name: "J" },
  { row: 3, col: 8, x: 8.75, y: 3.45, w: 1, h: 1, code: 14, index: 66, name: "K" },
  { row: 3, col: 9, x: 9.75, y: 3.45, w: 1, h: 1, code: 15, index: 67, name: "L" },
  { row: 3, col: 10, x: 10.75, y: 3.45, w: 1, h: 1, code: 51, index: 68, name: ";" },
  { row: 3, col: 11, x: 11.75, y: 3.45, w: 1, h: 1, code: 52, index: 69, name: "'" },
  { row: 3, col: 12, x: 12.75, y: 3.45, w: 2.25, h: 1, code: 40, index: 70, name: "Enter" },
  { row: 3, col: 13, x: 15.4, y: 3.2, w: 1, h: 1, code: 75, index: 32, name: "PgUp" },

  // Row 4
  { row: 4, col: 0, x: 0, y: 4.5, w: 2, h: 1, code: 225, index: 90, name: "Shift" },
  { row: 4, col: 1, x: 2, y: 4.5, w: 1, h: 1, code: 29, index: 89, name: "Z" },
  { row: 4, col: 2, x: 3, y: 4.5, w: 1, h: 1, code: 27, index: 88, name: "X" },
  { row: 4, col: 3, x: 4, y: 4.5, w: 1, h: 1, code: 6, index: 87, name: "C" },
  { row: 4, col: 4, x: 5, y: 4.5, w: 1, h: 1, code: 25, index: 86, name: "V" },
  { row: 4, col: 5, x: 6, y: 4.5, w: 1, h: 1, code: 5, index: 85, name: "B" },
  { row: 4, col: 6, x: 7, y: 4.5, w: 1, h: 1, code: 17, index: 84, name: "N" },
  { row: 4, col: 7, x: 8, y: 4.5, w: 1, h: 1, code: 16, index: 83, name: "M" },
  { row: 4, col: 8, x: 9, y: 4.5, w: 1, h: 1, code: 54, index: 82, name: "<" },
  { row: 4, col: 9, x: 10, y: 4.5, w: 1, h: 1, code: 55, index: 81, name: ">" },
  { row: 4, col: 10, x: 11, y: 4.5, w: 1, h: 1, code: 56, index: 80, name: "?" },
  { row: 4, col: 11, x: 12, y: 4.5, w: 2, h: 1, code: 229, index: 79, name: "R-Shift" },
  { row: 4, col: 12, x: 14.1, y: 4.5, w: 1, h: 1, code: 82, index: 78, name: "↑" },
  { row: 4, col: 13, x: 15.4, y: 4.25, w: 1, h: 1, code: 78, index: 41, name: "PgDn" },

  // Row 5
  { row: 5, col: 0, x: 0, y: 5.55, w: 1.25, h: 1, code: 224, index: 91, name: "Ctrl" },
  { row: 5, col: 1, x: 1.25, y: 5.55, w: 1.25, h: 1, code: 227, index: 92, name: "Win" },
  { row: 5, col: 2, x: 2.5, y: 5.55, w: 1.25, h: 1, code: 226, index: 93, name: "Alt" },
  { row: 5, col: 3, x: 3.75, y: 5.55, w: 6, h: 1, code: 44, index: 94, name: "Space" },
  { row: 5, col: 4, x: 10, y: 5.55, w: 1, h: 1, code: 230, index: 95, name: "R-Alt" },
  { row: 5, col: 5, x: 11, y: 5.55, w: 1, h: 1, code: 223, index: 97, name: "Fn" },
  { row: 5, col: 8, x: 13.1, y: 5.55, w: 1, h: 1, code: 80, index: 99, name: "←" },
  { row: 5, col: 9, x: 14.1, y: 5.55, w: 1, h: 1, code: 81, index: 100, name: "↓" },
  { row: 5, col: 10, x: 15.1, y: 5.55, w: 1, h: 1, code: 79, index: 101, name: "→" }
];

export const AVAILABLE_REMAP_KEYS = [
  { group: "Alphanumeric", keys: [
    { name: "A", code: 4 }, { name: "B", code: 5 }, { name: "C", code: 6 }, { name: "D", code: 7 },
    { name: "E", code: 8 }, { name: "F", code: 9 }, { name: "G", code: 10 }, { name: "H", code: 11 },
    { name: "I", code: 12 }, { name: "J", code: 13 }, { name: "K", code: 14 }, { name: "L", code: 15 },
    { name: "M", code: 16 }, { name: "N", code: 17 }, { name: "O", code: 18 }, { name: "P", code: 19 },
    { name: "Q", code: 20 }, { name: "R", code: 21 }, { name: "S", code: 22 }, { name: "T", code: 23 },
    { name: "U", code: 24 }, { name: "V", code: 25 }, { name: "W", code: 26 }, { name: "X", code: 27 },
    { name: "Y", code: 28 }, { name: "Z", code: 29 },
    { name: "1", code: 30 }, { name: "2", code: 31 }, { name: "3", code: 32 }, { name: "4", code: 33 },
    { name: "5", code: 34 }, { name: "6", code: 35 }, { name: "7", code: 36 }, { name: "8", code: 37 },
    { name: "9", code: 38 }, { name: "0", code: 39 }
  ]},
  { group: "Function Keys", keys: [
    { name: "F1", code: 58 }, { name: "F2", code: 59 }, { name: "F3", code: 60 }, { name: "F4", code: 61 },
    { name: "F5", code: 62 }, { name: "F6", code: 63 }, { name: "F7", code: 64 }, { name: "F8", code: 65 },
    { name: "F9", code: 66 }, { name: "F10", code: 67 }, { name: "F11", code: 68 }, { name: "F12", code: 69 }
  ]},
  { group: "Controls & Navigation", keys: [
    { name: "Escape", code: 41 }, { name: "Enter", code: 40 }, { name: "Space", code: 44 },
    { name: "Tab", code: 43 }, { name: "Backspace", code: 42 }, { name: "Delete", code: 76 },
    { name: "Page Up", code: 75 }, { name: "Page Down", code: 78 }, { name: "Home", code: 74 },
    { name: "End", code: 77 }, { name: "Insert", code: 73 },
    { name: "Up", code: 82 }, { name: "Down", code: 81 }, { name: "Left", code: 80 }, { name: "Right", code: 79 }
  ]},
  { group: "Media Controls", keys: [
    { name: "Mute", code: 127 }, { name: "Volume Up", code: 128 }, { name: "Volume Down", code: 129 },
    { name: "Play/Pause", code: 205 }, { name: "Next Track", code: 181 }, { name: "Prev Track", code: 182 }
  ]}
];

/**
 * Verified Official EvoFox Ronin 75% Wireless Hardware Shortcuts & Mode Matrix
 * Sourced directly from EvoFox Ronin Wireless Keyboard Help & Quick Start Guide.
 */
// Every entry below is taken from official Amkette sources only:
//  QSG = EvoFox Ronin Wireless Quick Start Guide (pages: Know Your Keyboard,
//        Charge / Bluetooth, 2.4 GHz / Type-C, OS Mode Switch, Backlighting
//        Controls, Multifunction Volume Knob)
//  HELP = amkette.com/pages/evofox-ronin-wireless-keyboard-help
// Nothing here is guessed. If it is not in those sources, it is not listed.
export const KEYBOARD_SHORTCUTS = [
  {
    categoryId: "connectivity",
    categoryName: "Connection Modes (Bluetooth, 2.4 GHz, Type-C)",
    icon: "signal",
    description: "Up to 5 devices: 3 Bluetooth slots, the 2.4 GHz receiver and the Type-C cable.",
    items: [
      {
        keys: ["Fn", "1"], combo: "Fn + 1", title: "Bluetooth slot 1",
        actionType: "Tap to switch • Long press to pair", hardwareSlot: "BT1", pairingName: "EvoFox Ronin TKL #1",
        ledBehavior: "Key 1 blinks fast while pairing.",
        description: "Long press Fn + 1 until key 1 blinks fast, then pick “EvoFox Ronin TKL #1” in your device’s Bluetooth settings. Tap Fn + 1 later to switch back to it.",
        webhidSupport: false,
        note: "This app can’t configure the keyboard over Bluetooth. Use 2.4 GHz (Fn + 4) or the cable (Fn + 5)."
      },
      {
        keys: ["Fn", "2"], combo: "Fn + 2", title: "Bluetooth slot 2",
        actionType: "Tap to switch • Long press to pair", hardwareSlot: "BT2", pairingName: "EvoFox Ronin TKL #2",
        ledBehavior: "Key 2 blinks fast while pairing.",
        description: "Long press Fn + 2 to pair a second device as “EvoFox Ronin TKL #2”. Tap Fn + 2 to switch to it.",
        webhidSupport: false,
        note: "Configuration needs 2.4 GHz or wired mode."
      },
      {
        keys: ["Fn", "3"], combo: "Fn + 3", title: "Bluetooth slot 3",
        actionType: "Tap to switch • Long press to pair", hardwareSlot: "BT3", pairingName: "EvoFox Ronin TKL #3",
        ledBehavior: "Key 3 blinks fast while pairing.",
        description: "Long press Fn + 3 to pair a third device as “EvoFox Ronin TKL #3”. Tap Fn + 3 to switch to it.",
        webhidSupport: false,
        note: "Configuration needs 2.4 GHz or wired mode."
      },
      {
        keys: ["Fn", "4"], combo: "Fn + 4", title: "2.4 GHz wireless (USB receiver)",
        actionType: "Tap to switch • Long press to re-pair", hardwareSlot: "2.4G", pairingName: "2.4 GHz receiver (PID 0x8FF0)",
        ledBehavior: "If the receiver isn’t recognised, long press Fn + 4 until the LED blinks fast.",
        description: "Take the 2.4 GHz receiver out of its slot on the keyboard, plug it into your computer and press Fn + 4.",
        webhidSupport: true,
        note: "Works with this app."
      },
      {
        keys: ["Fn", "5"], combo: "Fn + 5", title: "Wired (Type-C cable)",
        actionType: "Plug in • Tap Fn + 5", hardwareSlot: "USB", pairingName: "Type-C cable (PID 0xA157)",
        ledBehavior: "The cable also charges the keyboard.",
        description: "Connect the Type-C cable to the port on the top edge of the keyboard and press Fn + 5. You can use your own Type-C to C cable if needed.",
        webhidSupport: true,
        note: "Works with this app. Wired mode is also required for firmware updates."
      }
    ]
  },
  {
    categoryId: "detection",
    categoryName: "Mode Check & Battery",
    icon: "battery",
    description: "See which connection is active and how much charge is left.",
    items: [
      {
        keys: ["Fn"], combo: "Hold Fn", title: "Show the active connection",
        actionType: "Hold the Fn key",
        ledBehavior: "The number key of the active mode lights up (1, 2, 3 = Bluetooth, 4 = 2.4 GHz, 5 = wired).",
        description: "Hold Fn on its own to see which connection the keyboard is using right now.",
        webhidSupport: true
      },
      {
        keys: ["Type-C"], combo: "Charging", title: "Battery level",
        actionType: "Check on screen",
        description: "Charge with the provided Type-C cable. In Bluetooth mode, your computer or phone shows the battery percentage. In 2.4 GHz or wired mode, this app shows it in the top bar.",
        webhidSupport: true
      }
    ]
  },
  {
    categoryId: "backlight",
    categoryName: "Backlighting Controls",
    icon: "bulb",
    description: "On-keyboard lighting controls. They work without any software.",
    items: [
      { keys: ["Fn", "\\"], combo: "Fn + \\", title: "LED effects", actionType: "Tap to cycle", description: "Steps through the lighting effects.", webhidSupport: true },
      { keys: ["Fn", "Del"], combo: "Fn + Del", title: "No LED", actionType: "Tap", description: "Turns the backlight off (tap again to turn it back on).", webhidSupport: true },
      { keys: ["Fn", "→"], combo: "Fn + →", title: "LED colours", actionType: "Tap to cycle", description: "Changes the colour of the current effect.", webhidSupport: true },
      { keys: ["Fn", "←"], combo: "Fn + ←", title: "LED direction", actionType: "Tap", description: "Reverses the direction of the current effect.", webhidSupport: true },
      { keys: ["Fn", "↑"], combo: "Fn + ↑", title: "Increase LED brightness", actionType: "Tap", description: "Makes the backlight brighter.", webhidSupport: true },
      { keys: ["Fn", "↓"], combo: "Fn + ↓", title: "Decrease LED brightness", actionType: "Tap", description: "Makes the backlight dimmer.", webhidSupport: true },
      { keys: ["Fn", "−"], combo: "Fn + −", title: "Increase LED effect speed", actionType: "Tap", description: "Speeds up the current effect.", webhidSupport: true, note: "As printed in the official guide. If it feels reversed on your keyboard, use Fn + = instead." },
      { keys: ["Fn", "="], combo: "Fn + =", title: "Decrease LED effect speed", actionType: "Tap", description: "Slows down the current effect.", webhidSupport: true }
    ]
  },
  {
    categoryId: "system",
    categoryName: "OS Mode, Win Lock & Reset",
    icon: "settings",
    description: "Windows and Mac layouts, the Windows-key lock and factory reset.",
    items: [
      {
        keys: ["Fn", "A"], combo: "Fn + A", title: "Windows mode",
        actionType: "Tap",
        description: "Windows layout. Media functions on the F-row work with Fn, and F4 is a dedicated Copilot key.",
        webhidSupport: true
      },
      {
        keys: ["Fn", "S"], combo: "Fn + S", title: "Mac mode",
        actionType: "Tap",
        description: "Mac layout. Media functions on the F-row work without Fn, Ctrl acts as Control (⌃), Win as Option (⌥) and Alt as Command (⌘).",
        webhidSupport: true
      },
      {
        keys: ["Fn", "Win"], combo: "Fn + Win", title: "Windows key lock",
        actionType: "Tap to toggle",
        ledBehavior: "The lock LED next to the arrow keys shows when it’s on.",
        description: "Disables the Windows key so you don’t drop out of a game by accident.",
        webhidSupport: true
      },
      {
        keys: ["Fn", "Esc"], combo: "Fn + Esc (hold 5 s)", title: "Factory reset",
        actionType: "Press and hold for 5 seconds",
        description: "Resets all settings to default, including lighting and key assignments.",
        webhidSupport: true,
        note: "This app also has a factory reset under Device Settings."
      }
    ]
  },
  {
    categoryId: "multimedia",
    categoryName: "Media Keys (F-Row)",
    icon: "music",
    description: "Windows mode: hold Fn with the F-key. Mac mode: press the F-key on its own.",
    items: [
      { keys: ["Fn", "F1"], combo: "Fn + F1", title: "Screen brightness down", actionType: "Tap", description: "Lowers the display brightness (where your computer supports it)." },
      { keys: ["Fn", "F2"], combo: "Fn + F2", title: "Screen brightness up", actionType: "Tap", description: "Raises the display brightness (where your computer supports it)." },
      { keys: ["Fn", "F3"], combo: "Fn + F3", title: "Search", actionType: "Tap", description: "Opens search." },
      { keys: ["Fn", "F4"], combo: "Fn + F4", title: "Copilot", actionType: "Tap", description: "Opens Microsoft Copilot (Windows mode)." },
      { keys: ["Fn", "F7"], combo: "Fn + F7", title: "Previous track", actionType: "Tap", description: "Skips to the previous track." },
      { keys: ["Fn", "F8"], combo: "Fn + F8", title: "Play / pause", actionType: "Tap", description: "Plays or pauses media." },
      { keys: ["Fn", "F9"], combo: "Fn + F9", title: "Next track", actionType: "Tap", description: "Skips to the next track." },
      { keys: ["Fn", "F10"], combo: "Fn + F10", title: "Mute", actionType: "Tap", description: "Mutes or unmutes sound." },
      { keys: ["Fn", "F11"], combo: "Fn + F11", title: "Volume down", actionType: "Tap", description: "Turns the volume down." },
      { keys: ["Fn", "F12"], combo: "Fn + F12", title: "Volume up", actionType: "Tap", description: "Turns the volume up." },
      { keys: ["Fn", "PgUp"], combo: "Fn + PgUp", title: "Home", actionType: "Tap", description: "Sends Home (printed under PgUp)." },
      { keys: ["Fn", "PgDn"], combo: "Fn + PgDn", title: "End", actionType: "Tap", description: "Sends End (printed under PgDn)." }
    ]
  },
  {
    categoryId: "hardware",
    categoryName: "Volume Knob & Switches",
    icon: "knob",
    description: "The knob in the top-right corner and the power switch on the right edge.",
    items: [
      { keys: ["Knob ↻"], combo: "Turn clockwise", title: "Volume up", actionType: "Turn right", description: "Increases the volume.", webhidSupport: true },
      { keys: ["Knob ↺"], combo: "Turn anti-clockwise", title: "Volume down", actionType: "Turn left", description: "Decreases the volume.", webhidSupport: true },
      { keys: ["Knob"], combo: "Press the knob", title: "Mute", actionType: "Press", description: "Mutes the sound.", webhidSupport: true },
      { keys: ["ON / OFF"], combo: "Power switch", title: "Power on / off", actionType: "Slide", description: "The ON/OFF switch on the right edge, next to the → key. Turn it off to save battery when travelling.", webhidSupport: true },
      { keys: ["Caps", "Win"], combo: "LED indicators", title: "Caps Lock & Win Lock lights", actionType: "Status lights", description: "Two small LEDs between Fn and ← show Caps Lock and Windows Lock.", webhidSupport: true }
    ]
  }
];
