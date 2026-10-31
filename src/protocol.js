import { DEVICE_CONFIG } from './config.js';

export class EvoFoxRoninHID {
  constructor(onLog = console.log) {
    this.device = null;
    this.reportId = 0;
    this.reportCount = 64;
    this.isConnected = false;
    this.isOnline = false;
    this.deviceMode = 'Disconnected'; // 'USB' | '2.4G' | 'Disconnected'
    this.battery = 100;
    this.isCharging = false;
    this.firmwareVersion = 'Unknown';
    this.actualVid = null;
    this.actualPid = null;
    this.onLog = onLog;
    this.onStatusChange = null;
    this.pendingResolvers = [];
  }

  log(msg, type = 'info') {
    if (this.onLog) this.onLog(msg, type);
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  async getAuthorizedDevices() {
    if (!this.isSupported()) return [];
    try {
      const devices = await navigator.hid.getDevices();
      return devices.filter(d => 
        d.vendorId === DEVICE_CONFIG.vendorId &&
        (d.productId === 0xA157 || d.productId === 0x8FF0) &&
        d.collections && d.collections.some(c => c.usagePage === DEVICE_CONFIG.usagePage && c.usage === DEVICE_CONFIG.usage)
      );
    } catch (err) {
      this.log(`Error reading authorized devices: ${err.message}`, 'error');
      return [];
    }
  }

  async requestConnection() {
    if (!this.isSupported()) {
      throw new Error("WebHID is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.");
    }

    // Filter specifically by vendor usagePage (0xFF02) and usage (0x0002).
    // This strictly filters out the standard "USB Gaming Keyboard" interface (usage 0x01/0x06)
    // which Chromium blocks under its security sandbox, ensuring the user only selects the
    // valid vendor-configurable endpoint ("Unknown Device 1A2C:A157" or "2.4 Wireless Device").
    const filters = [
      { vendorId: DEVICE_CONFIG.vendorId, productId: 0xA157, usagePage: DEVICE_CONFIG.usagePage, usage: DEVICE_CONFIG.usage },
      { vendorId: DEVICE_CONFIG.vendorId, productId: 0x8FF0, usagePage: DEVICE_CONFIG.usagePage, usage: DEVICE_CONFIG.usage }
    ];

    this.log("Requesting EvoFox Ronin device access from browser...");
    const devices = await navigator.hid.requestDevice({ filters });
    if (!devices || devices.length === 0) {
      throw new Error("No device was selected.");
    }

    return await this.connect(devices[0]);
  }

  async connect(hidDevice) {
    if (!hidDevice) throw new Error("Invalid HID device handle");

    // Strict Hardware Identity Verification:
    // Only genuine EvoFox Ronin 75% keyboards (VID 0x1A2C, Wired PID 0xA157, 2.4G PID 0x8FF0)
    if (hidDevice.vendorId !== DEVICE_CONFIG.vendorId || (hidDevice.productId !== 0xA157 && hidDevice.productId !== 0x8FF0)) {
      this.log(`Hardware identity verification failed: Device VID 0x${hidDevice.vendorId ? hidDevice.vendorId.toString(16) : '0000'}, PID 0x${hidDevice.productId ? hidDevice.productId.toString(16) : '0000'} is not an EvoFox Ronin.`, 'error');
      throw new Error("INCOMPATIBLE_DEVICE");
    }

    // Ensure we are connecting to the vendor interface (0xFF02:0x0002)
    const hasVendorCollection = hidDevice.collections && hidDevice.collections.some(
      c => c.usagePage === DEVICE_CONFIG.usagePage && c.usage === DEVICE_CONFIG.usage
    );

    if (!hasVendorCollection) {
      // If the user selected the generic "USB Gaming Keyboard" interface instead of the vendor interface,
      // search authorized devices to find the sibling vendor interface
      const authorized = await navigator.hid.getDevices();
      const vendorEndpoint = authorized.find(d =>
        d.vendorId === hidDevice.vendorId &&
        d.productId === hidDevice.productId &&
        d.collections && d.collections.some(c => c.usagePage === DEVICE_CONFIG.usagePage && c.usage === DEVICE_CONFIG.usage)
      );

      if (vendorEndpoint) {
        hidDevice = vendorEndpoint;
        this.log("Auto-redirected from generic keyboard interface to vendor config endpoint.", "info");
      } else {
        throw new Error(
          "Protected interface selected. In the connection prompt, please select 'Unknown Device (1A2C:A157)' or '2.4 Wireless Device' instead of 'USB Gaming Keyboard'."
        );
      }
    }

    this.device = hidDevice;
    if (!this.device.opened) {
      this.log(`Opening HID connection to ${hidDevice.productName || 'EvoFox Ronin'}...`);
      await this.device.open();
    }

    // Determine report ID and report count strictly from the vendor collection
    this.reportId = 0;
    this.reportCount = 64;
    for (const collection of this.device.collections || []) {
      if (collection.usagePage === DEVICE_CONFIG.usagePage && collection.usage === DEVICE_CONFIG.usage) {
        if (collection.outputReports && collection.outputReports.length > 0) {
          const out = collection.outputReports[0];
          if (out.reportId !== undefined) {
            this.reportId = out.reportId;
          }
          if (out.items && out.items.length > 0) {
            this.reportCount = out.items[0].reportCount || 64;
          }
          break;
        }
      }
    }

    // Setup input listeners
    this.device.oninputreport = (event) => this._handleInputReport(event);

    this.isConnected = true;
    this.deviceMode = hidDevice.productId === 0xA157 ? 'USB' : '2.4G';
    this.isOnline = true; // tentative, will be confirmed by refreshDeviceStatus
    this.log(`Connected to ${hidDevice.productName || 'EvoFox Ronin'} in ${this.deviceMode} mode (Report ID: ${this.reportId}, Report Count: ${this.reportCount})`, 'success');

    // Query status, battery, and firmware version
    await this.refreshDeviceStatus();
    return this;
  }

  async disconnect() {
    this.isConnected = false;
    this.isOnline = false;
    this.deviceMode = 'Disconnected';
    if (this.device && this.device.opened) {
      try {
        await this.device.close();
      } catch (e) {
        console.warn("Error closing HID device:", e);
      }
    }
    this.device = null;
    this.log("Disconnected from EvoFox Ronin.", "info");
  }

  _handleInputReport(event) {
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    
    // Check magic preamble: 0xAA (170), 0x55 (85), 0xCC (204), 0x33 (51)
    if (data.length >= 4 && data[0] === 170 && data[1] === 85 && data[2] === 204 && data[3] === 51) {
      // Resolve any pending request awaiting response
      if (this.pendingResolvers.length > 0) {
        const resolver = this.pendingResolvers.shift();
        resolver(data);
      }
      // Only status replies (opcode 0x0E) carry mode / battery, as in the official driver.
      // Replies to other commands echo their own payload, which must not be read as status.
      if (data[4] === DEVICE_CONFIG.opcodes.GET_STATUS_BATTERY) this._parseStatusPacket(data);
    }
  }

  _parseStatusPacket(data) {
    if (data.length < 14) return;
    
    const opcode = data[4];
    const rawBattery = data[5] !== undefined ? data[5] : 0;
    const modeFlag = data[6]; // 3 = USB_ONLINE, 1 = WIRELESS_24G_ONLINE, 0 = OFFLINE
    const chargingFlag = data[7];

    this.log(`Device telemetry: Opcode=0x${opcode?.toString(16)}, Batt=${rawBattery}%, ModeFlag=0x${modeFlag?.toString(16)}, Charge=${chargingFlag}`, 'info');

    // 1. Connection Mode & Online State
    if (modeFlag === 3) {
      this.deviceMode = 'USB';
      this.isOnline = true;
    } else if (modeFlag === 1) {
      this.deviceMode = '2.4G';
      this.isOnline = true;
    } else if (modeFlag === 0) {
      // Dongle receiver is active in USB port, but keyboard RF link is offline
      // (keyboard is turned off, asleep, or physically switched to Bluetooth mode)
      this.isOnline = false;
      this.log("2.4G Receiver is connected, but keyboard RF link is offline (switched to Bluetooth or asleep).", 'warning');
    }

    // 2. Battery Percentage
    if (this.isOnline) {
      if (this.deviceMode === 'USB') {
        // In wired mode, battery is 100% and charging
        this.battery = rawBattery > 0 ? (rawBattery >= 95 ? 100 : rawBattery) : 100;
        this.isCharging = chargingFlag === 1 || true;
      } else {
        // 2.4G Wireless Mode
        if (rawBattery > 0) {
          const clamped = Math.max(0, Math.min(rawBattery, 100));
          this.battery = clamped >= 95 ? 100 : clamped;
        } else if (this.battery === 0 || this.battery === undefined) {
          // If 0% reported right upon connection, RF cache is synchronizing with keyboard
          this.battery = 100;
          setTimeout(() => this.refreshDeviceStatus().catch(() => {}), 500);
        }
        this.isCharging = chargingFlag === 1;
      }
    }

    // Bytes 8-9: VID, Bytes 10-11: PID
    this.actualVid = (data[8] << 8) | data[9];
    this.actualPid = (data[10] << 8) | data[11];

    // Bytes 12-13: Firmware Version
    const t = data[12];
    const r = data[13];
    if (t !== 0 || r !== 0) {
      this.firmwareVersion = `${(t >> 4) & 15}.${15 & t}.${10 * ((r >> 4) & 15) + (15 & r)}`;
    }

    if (this.onStatusChange) {
      this.onStatusChange({
        isOnline: this.isOnline,
        deviceMode: this.deviceMode,
        battery: this.battery,
        isCharging: this.isCharging,
        firmwareVersion: this.firmwareVersion
      });
    }
  }

  async sendRawPacket(buffer65, expectReply = false, timeoutMs = 1500) {
    if (!this.device || !this.device.opened) {
      throw new Error("Device is not connected");
    }

    // Slice off reportId at index 0
    let payload = new Uint8Array(buffer65.slice(1));

    // Ensure payload matches this.reportCount (OEM logic)
    if (this.reportCount > 0) {
      if (payload.length > this.reportCount) {
        payload = payload.slice(0, this.reportCount);
      } else if (payload.length < this.reportCount) {
        const padded = new Uint8Array(this.reportCount);
        padded.set(payload);
        payload = padded;
      }
    }

    let replyPromise = null;
    if (expectReply) {
      replyPromise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          const idx = this.pendingResolvers.indexOf(resolve);
          if (idx !== -1) this.pendingResolvers.splice(idx, 1);
          resolve(null); // Return null on timeout without crashing
        }, timeoutMs);

        this.pendingResolvers.push((res) => {
          clearTimeout(timer);
          resolve(res);
        });
      });
    }

    await this.device.sendReport(this.reportId, payload);

    if (expectReply) {
      return await replyPromise;
    }
    return true;
  }

  createBasePacket(opcode) {
    const pkt = new Array(65).fill(0);
    pkt[0] = this.reportId;
    pkt[1] = 170; // 0xAA
    pkt[2] = 85;  // 0x55
    pkt[3] = 204; // 0xCC
    pkt[4] = 51;  // 0x33
    pkt[5] = opcode;
    return pkt;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async refreshDeviceStatus() {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.GET_STATUS_BATTERY);
    this.log("Polling device status, battery & firmware...");
    const reply = await this.sendRawPacket(pkt, true, 2000);
    if (reply) {
      this._parseStatusPacket(reply);
      this.log(`Status synced: Battery ${this.battery}%, Charging: ${this.isCharging}, Mode: ${this.deviceMode}, Online: ${this.isOnline}, FW: ${this.firmwareVersion}`, 'info');
    }
    return {
      battery: this.battery,
      isCharging: this.isCharging,
      mode: this.deviceMode,
      isOnline: this.isOnline,
      firmwareVersion: this.firmwareVersion
    };
  }

  /**
   * Set Backlight Lighting Effect Mode
   */
  async setLightMode({ mode, brightness = 5, speed = 3, direction = 0, colorIndex = 7, colorindex }) {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_LIGHT_MODE);
    const finalColor = colorindex !== undefined ? colorindex : (colorIndex !== undefined ? colorIndex : 7);

    if (mode === 21) {
      // Light Off
      pkt[5] = 5;
      pkt[6] = 1;
    } else if (mode === 128) {
      // Music Rhythm mode
      pkt[6] = 170;
    } else {
      pkt[6] = Math.max(0, mode - 1);
      pkt[7] = Math.max(0, brightness - 1);
      pkt[8] = Math.max(0, speed - 1);
      pkt[9] = direction ? 1 : 0;
      pkt[10] = finalColor;
    }

    this.log(`Applying Backlight Mode ${mode} (brightness: ${brightness}, speed: ${speed}, dir: ${direction}, colorIndex: ${finalColor})`);
    await this.sendRawPacket(pkt);
    await this.delay(50);

    // If custom per-key RGB mode (23), initialize custom channel
    if (mode === 23) {
      const initPkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_CUSTOM_LIGHT_INIT);
      await this.sendRawPacket(initPkt);
    }
    return true;
  }

  /**
   * Set Boxlight (Side Strip Lighting) Mode
   */
  async setLightBoxMode({ mode, brightness = 5, speed = 3, direction = 0, colorIndex = 7, colorindex }) {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_LIGHT_MODE);
    const finalColor = colorindex !== undefined ? colorindex : (colorIndex !== undefined ? colorIndex : 7);
    pkt[6] = (mode + 128 - 1) & 0xFF;
    pkt[7] = (brightness + 128 - 1) & 0xFF;
    pkt[8] = (speed + 128 - 1) & 0xFF;
    pkt[9] = (direction + 128) & 0xFF;
    pkt[10] = (finalColor + 128) & 0xFF;

    this.log(`Applying Side Strip Mode ${mode}`);
    await this.sendRawPacket(pkt);
    await this.delay(50);
    return true;
  }

  /**
   * Set Custom Per-Key RGB colors
   * @param {Array<{ index: number, color: string }>} keyColors 
   */
  async setUserLightAllKeys(keyColors) {
    if (!keyColors || keyColors.length === 0) return;

    this.log(`Uploading custom per-key RGB colors for ${keyColors.length} keys...`);
    const colorBuffer = new Array(600).fill(0);

    for (const item of keyColors) {
      const hex = item.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      colorBuffer[3 * item.index + 0] = r;
      colorBuffer[3 * item.index + 1] = g;
      colorBuffer[3 * item.index + 2] = b;
    }

    // 2-pass sync
    for (let pass = 0; pass < 2; pass++) {
      let offset = 0;
      const initPkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_CUSTOM_LIGHT_INIT);
      await this.sendRawPacket(initPkt);
      await this.delay(10);

      for (let chunkIdx = 0; chunkIdx < 6; chunkIdx++) {
        const chunkPkt = this.createBasePacket(DEVICE_CONFIG.opcodes.CUSTOM_RGB_BLOCK + chunkIdx);
        for (let i = 0; i < 54 && (offset + i) < colorBuffer.length; i++) {
          chunkPkt[6 + i] = colorBuffer[offset + i];
        }
        offset += 54;
        await this.sendRawPacket(chunkPkt);
        await this.delay(5);
      }
      if (pass === 0) await this.delay(100);
    }

    // Save custom RGB to persistent device memory
    const savePkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SAVE_CUSTOM_LIGHT);
    await this.sendRawPacket(savePkt);
    await this.delay(50);
    this.log("Custom per-key RGB colors committed to keyboard flash memory!", 'success');
  }

  /**
   * Remap a key to a new HID keycode
   * @param {number} layer (0 = Default, 1 = FN Layer)
   * @param {number} sourceKeyCode HID code of the physical key (KEYBOARD_LAYOUT .code)
   * @param {number} targetKeyCode USB HID keycode
   */
  // Official layout: byte 6 = layer + 1, byte 7 = the source key's HID code, byte 8 = target code.
  async setKeyRemap(layer, sourceKeyCode, targetKeyCode) {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_KEY_REMAP);
    pkt[6] = layer + 1;
    pkt[7] = sourceKeyCode;
    pkt[8] = targetKeyCode;

    this.log(`Remapping key code 0x${sourceKeyCode.toString(16).toUpperCase()} on Layer ${layer} to Keycode 0x${targetKeyCode.toString(16).toUpperCase()}`);
    await this.sendRawPacket(pkt);
    await this.delay(30);
    return true;
  }

  /**
   * Set Sleep Level (official levels: 1 = 2/30 min, 2 = 15/40 min, 3 = 30/60 min, 4 = never)
   */
  async setSleepLevel(level) {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_SLEEP_TIMEOUT);
    pkt[6] = Math.max(1, Math.min(level, 4));
    this.log(`Setting Sleep Timeout Level to ${pkt[6]}`);
    await this.sendRawPacket(pkt);
    await this.delay(30);
    return true;
  }

  /**
   * Set Key Response Level (1 = fastest: wired 2-3 ms; 2 = 4-5 ms; 3 = 6-7 ms)
   */
  async setResponseLevel(level) {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_RESPONSE_RATE);
    pkt[6] = Math.max(1, Math.min(level, 3));
    this.log(`Setting Key Response Level to ${pkt[6]}`);
    await this.sendRawPacket(pkt);
    await this.delay(30);
    return true;
  }

  /**
   * Set Fn layer behaviour (official opcode 0x10): byte 6 = 0 hold Fn, 1 press once to switch.
   */
  async setFnLayerMode(mode) {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.SET_FN_LAYER_MODE);
    pkt[6] = mode ? 1 : 0;
    this.log(`Setting Fn layer mode to ${pkt[6] ? 'press once' : 'hold'}`);
    await this.sendRawPacket(pkt);
    await this.delay(30);
    return true;
  }

  /**
   * Restore Keyboard Factory Defaults
   */
  async restoreFactoryDefaults() {
    const pkt = this.createBasePacket(DEVICE_CONFIG.opcodes.FACTORY_RESET);
    this.log("Sending Factory Reset command to EvoFox Ronin...", 'warn');
    await this.sendRawPacket(pkt);
    await this.delay(200);
    await this.refreshDeviceStatus();
    this.log("Factory defaults restored successfully!", 'success');
    return true;
  }

  async disconnect() {
    if (this.device && this.device.opened) {
      await this.device.close();
    }
    this.device = null;
    this.isConnected = false;
    this.deviceMode = 'Disconnected';
    this.log("Device disconnected.");
  }
}
