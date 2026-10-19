// Bu bilgisayardaki 5 RGB cihazının OpenRGB'den okunmuş mod tanımları (2026-10-19, OpenRGB 1.0, protokol 4)
const m = (id, name, flagList, colorMode, colorMin = 0, colorMax = 0, speed = [0, 0], bri = [0, 0]) => ({
  id, name, flagList, colorMode, colorMin, colorMax, speedMin: speed[0], speedMax: speed[1], brightnessMin: bri[0], brightnessMax: bri[1], colors: [],
});
const leds = (n) => Array.from({ length: n }, () => ({ red: 0, green: 0, blue: 0 }));

const RAM = {
  deviceId: 0, type: 1, name: 'Corsair Vengeance RGB Pro SL DDR4', location: 'I2C: PIIX4, address 0x18', colors: leds(10),
  modes: [
    m(0, 'Direct', ['perLedColor'], 1),
    m(1, 'Custom', ['perLedColor', 'automaticSave'], 1),
    m(2, 'Color Shift', ['speed', 'brightness', 'modeSpecificColor', 'randomColor', 'automaticSave'], 2, 2, 2, [0, 2], [0, 255]),
    m(3, 'Color Pulse', ['speed', 'brightness', 'modeSpecificColor', 'randomColor', 'automaticSave'], 2, 2, 2, [0, 2], [0, 255]),
    m(4, 'Rainbow Wave', ['speed', 'directionLR', 'directionUD', 'automaticSave', 'direction'], 0, 0, 0, [0, 2]),
    m(5, 'Color Wave', ['speed', 'directionLR', 'directionUD', 'brightness', 'modeSpecificColor', 'randomColor', 'automaticSave', 'direction'], 2, 2, 2, [0, 2], [0, 255]),
    m(9, 'Rainbow', ['speed', 'automaticSave'], 0, 0, 0, [0, 2]),
  ],
};
const BOARD = {
  deviceId: 2, type: 0, name: 'B550 AORUS ELITE AX V2', location: 'I2C: PIIX4, address 0x68', colors: leds(5),
  modes: [
    m(0, 'Direct', ['brightness', 'perLedColor'], 1, 0, 0, [0, 0], [0, 255]),
    m(1, 'Static', ['brightness', 'modeSpecificColor'], 2, 1, 1, [0, 0], [0, 255]),
    m(2, 'Breathing', ['speed', 'brightness', 'modeSpecificColor', 'randomColor'], 2, 1, 1, [9, 0], [0, 100]),
    m(4, 'Color Cycle', ['speed', 'brightness'], 0, 0, 0, [9, 0], [0, 255]),
    m(5, 'Double Flash', ['speed', 'brightness', 'modeSpecificColor', 'randomColor'], 2, 1, 1, [9, 0], [0, 255]),
  ],
};
const MOUSE = {
  deviceId: 3, type: 6, name: 'Logitech G203 Lightsync', location: 'HID: 046D', colors: leds(3),
  modes: [
    m(0, 'Direct', ['perLedColor'], 1),
    m(1, 'Off', [], 0),
    m(2, 'Static', ['modeSpecificColor'], 2, 0, 0),
    m(3, 'Cycle', ['speed', 'brightness'], 0, 0, 0, [20000, 1000], [0, 20]),
    m(4, 'Breathing', ['speed', 'brightness', 'modeSpecificColor'], 2, 0, 0, [20000, 1000], [0, 20]),
    m(5, 'Wave', ['speed', 'directionLR', 'brightness', 'direction'], 0, 0, 0, [20000, 1000], [0, 20]),
  ],
};
const KEYBOARD = {
  deviceId: 4, type: 5, name: 'EVision Keyboard 320F:5000', location: 'HID: 320F', colors: leds(126),
  modes: [
    m(0, 'Custom', ['brightness', 'perLedColor', 'automaticSave'], 1, 0, 0, [0, 0], [0, 4]),
    m(1, 'Color Wave', ['speed', 'directionLR', 'brightness', 'modeSpecificColor', 'randomColor', 'automaticSave', 'direction'], 2, 1, 1, [5, 0], [0, 4]),
    m(4, 'Spectrum Cycle', ['speed', 'brightness', 'automaticSave'], 0, 0, 0, [5, 0], [0, 4]),
    m(5, 'Breathing', ['speed', 'brightness', 'modeSpecificColor', 'randomColor', 'automaticSave'], 2, 1, 1, [5, 0], [0, 4]),
    m(10, 'Static', ['brightness', 'modeSpecificColor', 'randomColor', 'automaticSave'], 2, 1, 1, [0, 0], [0, 4]),
    m(12, 'Vertical Rainbow', ['speed', 'directionUD', 'brightness', 'modeSpecificColor', 'randomColor', 'automaticSave', 'direction'], 2, 1, 1, [5, 0], [0, 4]),
  ],
};

module.exports = { RAM, BOARD, MOUSE, KEYBOARD, ALL: [RAM, BOARD, MOUSE, KEYBOARD] };
