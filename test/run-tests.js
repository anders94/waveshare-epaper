// Hardware-free tests using injected mock GPIO/SPI backends (see hal.js).
// Run with: npm test

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');
const { createDisplay } = require('..');

// --- Mock HAL -------------------------------------------------------------

// Both mocks append to a shared log so the test can reconstruct the
// command/data stream in the order the display would see it.
function createMockHal() {
    const log = [];

    const gpio = {
        released: false,
        write: async (pin, value) => { log.push({ type: 'gpio', pin, value }); },
        read: async () => 0, // BUSY pin always reads idle
        release: async function () { this.released = true; }
    };

    const spi = {
        opened: false,
        closed: false,
        open: async function () { this.opened = true; },
        transfer: async (buffer) => { log.push({ type: 'spi', buffer: Buffer.from(buffer) }); },
        close: function () { this.closed = true; }
    };

    return { gpio, spi, log };
}

// Reconstruct the SPI stream as {command, data} packets by tracking the DC
// pin: DC low = command byte, DC high = data bytes.
function parsePackets(log, dcPin = 25) {
    const packets = [];
    let dc = null;
    let current = null;

    for (const entry of log) {
        if (entry.type === 'gpio' && entry.pin === dcPin) {
            dc = entry.value;
        } else if (entry.type === 'spi') {
            if (dc === 0) {
                current = { command: entry.buffer[0], chunks: [] };
                packets.push(current);
            } else if (current) {
                current.chunks.push(entry.buffer);
            }
        }
    }

    return packets.map(p => ({ command: p.command, data: Buffer.concat(p.chunks) }));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- Injection safety -----------------------------------------------------

test('rejects shell metacharacters in gpioChip', () => {
    assert.throws(
        () => createDisplay('13in3k', 'mono', { gpioChip: 'gpiochip0; rm -rf /' }),
        /Invalid GPIO chip name/
    );
});

test('rejects non-integer GPIO pins', () => {
    assert.throws(
        () => createDisplay('13in3k', 'mono', { rstPin: '17; reboot' }),
        /Invalid GPIO pin/
    );
    assert.throws(
        () => createDisplay('13in3k', 'mono', { dcPin: 3.5 }),
        /Invalid GPIO pin/
    );
});

test('accepts pin 0 and numeric-string pins', () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('13in3k', 'mono', { gpio, spi, rstPin: 0, dcPin: '25' });
    assert.strictEqual(epd.pins.RST, 0);
    assert.strictEqual(epd.pins.DC, 25);
});

// --- sendData / sendBuffer ------------------------------------------------

test('sendData accepts a Buffer without mangling it', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('2in13', 'mono', { gpio, spi });

    await epd.sendData(Buffer.from([1, 2, 3]));
    const last = log[log.length - 1];
    assert.deepStrictEqual(Array.from(last.buffer), [1, 2, 3]);
});

test('sendData still accepts arrays and single bytes', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('2in13', 'mono', { gpio, spi });

    await epd.sendData([4, 5]);
    assert.deepStrictEqual(Array.from(log[log.length - 1].buffer), [4, 5]);

    await epd.sendData(0xF7);
    assert.deepStrictEqual(Array.from(log[log.length - 1].buffer), [0xF7]);
});

test('sendBuffer chunks large buffers and preserves content', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('2in13', 'mono', { gpio, spi });

    const big = Buffer.alloc(10000);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xFF;

    await epd.sendBuffer(big);
    const chunks = log.filter(e => e.type === 'spi').map(e => e.buffer);
    assert.strictEqual(chunks.length, 3); // 4096 + 4096 + 1808
    assert.ok(chunks.every(c => c.length <= 4096));
    assert.deepStrictEqual(Buffer.concat(chunks), big);
});

// --- BUSY polarity --------------------------------------------------------

// Feed waitUntilIdle a scripted sequence of BUSY pin reads and count how
// many polls it takes before returning.
async function countBusyPolls(model, sequence) {
    const { gpio, spi } = createMockHal();
    let polls = 0;
    gpio.read = async () => sequence[Math.min(polls++, sequence.length - 1)];
    const epd = createDisplay(model, 'mono', { gpio, spi });
    await epd.waitUntilIdle();
    return polls;
}

test('waitUntilIdle: SSD-family (13in3k) waits while BUSY reads 1', async () => {
    assert.strictEqual(await countBusyPolls('13in3k', [1, 1, 0]), 3);
    assert.strictEqual(await countBusyPolls('13in3k', [0]), 1);
});

test('waitUntilIdle: UC8176-class (7in5, 7in3f) waits while BUSY reads 0', async () => {
    assert.strictEqual(await countBusyPolls('7in5', [0, 0, 1]), 3);
    assert.strictEqual(await countBusyPolls('7in5', [1]), 1);
    assert.strictEqual(await countBusyPolls('7in3f', [0, 1]), 2);
});

// --- Pixel formats --------------------------------------------------------

test('4gray format packs 2-bit pixels top bits first', () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('13in3k', '4gray', { gpio, spi });

    epd.setPixel(0, 0, 0); // black    -> 00
    epd.setPixel(1, 0, 1); // dark     -> 01
    epd.setPixel(2, 0, 2); // light    -> 10
    epd.setPixel(3, 0, 3); // white    -> 11
    assert.strictEqual(epd.imageBuffer[0], 0b00011011);

    epd.setPixel(0, 0, 99); // out of range -> white
    assert.strictEqual(epd.imageBuffer[0], 0b11011011);
});

test('3color format maintains both planes per pixel', () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('2in7b', 'red', { gpio, spi });

    epd.setPixel(0, 0, 2); // accent: white in image plane, set in color plane
    assert.strictEqual(epd.imageBuffer[0] & 0x80, 0x80);
    assert.strictEqual(epd.colorBuffer[0] & 0x80, 0x80);

    epd.setPixel(0, 0, 0); // black: cleared in both planes
    assert.strictEqual(epd.imageBuffer[0] & 0x80, 0);
    assert.strictEqual(epd.colorBuffer[0] & 0x80, 0);

    epd.setPixel(0, 0, 1); // white: set in image plane, cleared in color plane
    assert.strictEqual(epd.imageBuffer[0] & 0x80, 0x80);
    assert.strictEqual(epd.colorBuffer[0] & 0x80, 0);
});

test('7color format packs nibbles and clamps out-of-range colors', () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('7in3f', '7color', { gpio, spi });

    epd.setPixel(0, 0, epd.colors.RED);  // upper nibble
    epd.setPixel(1, 0, 9);               // clamped to 7, lower nibble
    assert.strictEqual(epd.imageBuffer[0], (4 << 4) | 7);
});

test('rgbToColor quantizes per color mode', () => {
    const { gpio, spi } = createMockHal();

    const mono = createDisplay('2in13', 'mono', { gpio, spi });
    assert.strictEqual(mono.rgbToColor(30, 30, 30), 0);
    assert.strictEqual(mono.rgbToColor(220, 220, 220), 1);

    const gray = createDisplay('2in7', '4gray', { gpio, spi });
    assert.strictEqual(gray.rgbToColor(100, 100, 100), 1);
    assert.strictEqual(gray.rgbToColor(170, 170, 170), 2);

    const tri = createDisplay('2in7b', 'red', { gpio, spi });
    assert.strictEqual(tri.rgbToColor(255, 0, 0), 2); // red -> accent

    const seven = createDisplay('7in3f', '7color', { gpio, spi });
    assert.strictEqual(seven.rgbToColor(255, 0, 0), seven.colors.RED);
    assert.strictEqual(seven.rgbToColor(255, 200, 0), seven.colors.ORANGE);
});

// --- Driver registry ------------------------------------------------------

test('every model and alias resolves through the registry', () => {
    const { gpio, spi } = createMockHal();
    const { getSupportedModels } = require('..');

    for (const meta of getSupportedModels()) {
        const options = { gpio, spi, experimental: true };
        for (const name of [meta.model, ...meta.aliases]) {
            const epd = createDisplay(name, meta.colorModes[0], options);
            const [w] = meta.size.split('x').map(Number);
            assert.strictEqual(epd.width, w, `${name} should create a ${meta.size} display`);
        }
    }

    assert.strictEqual(getSupportedModels().length, 8);
});

test('unknown model throws with the supported list', () => {
    assert.throws(
        () => createDisplay('9in99', 'mono'),
        /Unsupported display model: 9in99.*13in3k/
    );
});

// --- Experimental driver gating -------------------------------------------

test('13in3gray (IT8951) is gated behind the experimental option', () => {
    const { gpio, spi } = createMockHal();

    assert.throws(
        () => createDisplay('13in3gray', '16gray', { gpio, spi }),
        /experimental and not yet functional/
    );

    const epd = createDisplay('13in3gray', '16gray', { gpio, spi, experimental: true });
    assert.strictEqual(epd.width, 1600);

    const { getSupportedModels } = require('..');
    const entry = getSupportedModels().find(m => m.model === '13in3gray');
    assert.strictEqual(entry.experimental, true);
});

// --- Native GPIO backend --------------------------------------------------

// Fake node-libgpiod binding matching the Chip/Line API of v0.6
function createFakeLibgpiod() {
    const state = { values: new Map(), requested: [], released: [] };

    class FakeLine {
        constructor(pin) { this.pin = pin; }
        requestOutputMode() { state.requested.push({ pin: this.pin, direction: 'out' }); }
        requestInputMode() { state.requested.push({ pin: this.pin, direction: 'in' }); }
        setValue(v) { state.values.set(this.pin, v); }
        getValue() { return state.values.get(this.pin) ?? 0; }
        release() { state.released.push(this.pin); }
    }

    class FakeChip {
        constructor(identifier) { state.chipIdentifier = identifier; }
        getLine(pin) { return new FakeLine(pin); }
    }

    return { binding: { Chip: FakeChip, Line: FakeLine }, state };
}

test('LibgpiodGpio caches lines and round-trips values', async () => {
    const { LibgpiodGpio } = require('../hal');
    const { binding, state } = createFakeLibgpiod();
    const gpio = new LibgpiodGpio('gpiochip0', binding);

    assert.strictEqual(state.chipIdentifier, 'gpiochip0');

    await gpio.write(17, 1);
    await gpio.write(17, 0);
    await gpio.write(17, 1);
    // Three writes, but the line is requested only once
    assert.deepStrictEqual(state.requested, [{ pin: 17, direction: 'out' }]);
    assert.strictEqual(state.values.get(17), 1);

    state.values.set(24, 1);
    assert.strictEqual(await gpio.read(24), 1);
    assert.deepStrictEqual(state.requested[1], { pin: 24, direction: 'in' });
});

test('LibgpiodGpio re-requests on direction change and releases all lines', async () => {
    const { LibgpiodGpio } = require('../hal');
    const { binding, state } = createFakeLibgpiod();
    const gpio = new LibgpiodGpio('gpiochip0', binding);

    await gpio.write(5, 1);
    await gpio.read(5); // direction change: old line released, new one requested
    assert.deepStrictEqual(state.released, [5]);
    assert.deepStrictEqual(state.requested.map(r => r.direction), ['out', 'in']);

    await gpio.write(6, 0);
    await gpio.release();
    assert.ok(state.released.includes(6));
    assert.strictEqual(gpio.lines.size, 0);
});

test('LibgpiodGpio validates chip name and pins like CliGpio', () => {
    const { LibgpiodGpio } = require('../hal');
    const { binding } = createFakeLibgpiod();

    assert.throws(() => new LibgpiodGpio('gpiochip0; rm -rf /', binding), /Invalid GPIO chip name/);
    const gpio = new LibgpiodGpio('gpiochip0', binding);
    assert.rejects(() => gpio.write('7; reboot', 1), /Invalid GPIO pin/);
});

test('createDefaultGpio falls back to CliGpio when node-libgpiod is unavailable', () => {
    const { createDefaultGpio, CliGpio } = require('../hal');
    // node-libgpiod is not installed in this environment
    const gpio = createDefaultGpio('gpiochip0');
    assert.ok(gpio instanceof CliGpio);
});

// --- Full display cycle ---------------------------------------------------

test('13in3k mono: init + display sends the full framebuffer', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('13in3k', 'mono', { gpio, spi });

    await epd.init();
    assert.ok(spi.opened);
    assert.ok(epd.initialized);

    log.length = 0; // only look at the display() traffic
    epd.imageBuffer.fill(0xFF); // white background
    epd.setPixel(0, 0, 0);      // one black pixel top-left

    await epd.display();

    const packets = parsePackets(log);
    const writeRam = packets.find(p => p.command === 0x24);
    assert.ok(writeRam, 'expected a 0x24 (write RAM) command');
    assert.strictEqual(writeRam.data.length, 960 * 680 / 8);
    assert.strictEqual(writeRam.data[0], 0x7F); // MSB cleared = black pixel at (0,0)
    assert.ok(packets.some(p => p.command === 0x20), 'expected a 0x20 (refresh) command');
});

test('2in7b 3-color: display sends both black and color planes', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('2in7b', 'red', { gpio, spi });
    epd.initialized = true; // skip panel init, exercise displayImage only

    await epd.display();

    const planeBytes = 176 * 264 / 8;
    const packets = parsePackets(log);
    const black = packets.find(p => p.command === 0x24);
    const color = packets.find(p => p.command === 0x26);
    assert.strictEqual(black.data.length, planeBytes);
    assert.strictEqual(color.data.length, planeBytes);
});

test('cleanup closes SPI and releases GPIO', async () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('7in5', 'mono', { gpio, spi });

    await epd.cleanup();
    assert.ok(spi.closed);
    assert.ok(gpio.released);
});

// --- Robustness -----------------------------------------------------------

test('waitUntilIdle throws on busy timeout', async () => {
    const { gpio, spi } = createMockHal();
    gpio.read = async () => 1; // stuck busy (SSD-family polarity)
    const epd = createDisplay('13in3k', 'mono', { gpio, spi, busyTimeoutMs: 250 });

    await assert.rejects(() => epd.waitUntilIdle(), /busy timeout after 250ms/);
});

test('display() rejects concurrent calls', async () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('2in13', 'mono', { gpio, spi });
    epd.initialized = true;

    let finish;
    epd.displayImage = () => new Promise(resolve => { finish = resolve; });

    const first = epd.display();
    await assert.rejects(() => epd.display(), /already in progress/);

    finish();
    await first;

    // A completed refresh unlocks the next one
    epd.displayImage = async () => {};
    await epd.display();
});

test('cleanup puts an initialized panel to sleep before power-off', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('13in3k', 'mono', { gpio, spi });
    epd.initialized = true;

    await epd.cleanup();

    const sleep = parsePackets(log).find(p => p.command === 0x10);
    assert.ok(sleep, 'expected a 0x10 (deep sleep) command');
    assert.deepStrictEqual(Array.from(sleep.data), [0x01]);
    assert.strictEqual(epd.initialized, false);
});

test('cleanup on an uninitialized panel sends no SPI traffic', async () => {
    const { gpio, spi, log } = createMockHal();
    const epd = createDisplay('13in3k', 'mono', { gpio, spi });

    await epd.cleanup();
    assert.strictEqual(log.filter(e => e.type === 'spi').length, 0);
});

test('7in5 and 7in3f use UC-family deep sleep sequences', async () => {
    {
        const { gpio, spi, log } = createMockHal();
        gpio.read = async () => 1; // idle for active-low BUSY
        const epd = createDisplay('7in5', 'mono', { gpio, spi });
        await epd.sleep();
        const packets = parsePackets(log);
        assert.deepStrictEqual(packets.map(p => p.command), [0x02, 0x07]);
        assert.deepStrictEqual(Array.from(packets[1].data), [0xA5]);
    }
    {
        const { gpio, spi, log } = createMockHal();
        const epd = createDisplay('7in3f', '7color', { gpio, spi });
        await epd.sleep();
        const packets = parsePackets(log);
        assert.deepStrictEqual(packets.map(p => p.command), [0x07]);
        assert.deepStrictEqual(Array.from(packets[0].data), [0xA5]);
    }
});

test('csPin option is ignored and CS is absent from the pin map', () => {
    const { gpio, spi } = createMockHal();
    const epd = createDisplay('2in13', 'mono', { gpio, spi, csPin: 22 });
    assert.strictEqual(epd.pins.CS, undefined);
});

test('loadPNG enforces the pixel cap and converts pixels', async () => {
    // 2x2 PNG: opaque black at (0,0), opaque white elsewhere
    const png = new PNG({ width: 2, height: 2 });
    png.data.fill(255);
    png.data[0] = png.data[1] = png.data[2] = 0;
    const file = path.join(os.tmpdir(), `waveshare-epaper-test-${process.pid}.png`);
    fs.writeFileSync(file, PNG.sync.write(png));

    try {
        const { gpio, spi } = createMockHal();
        const epd = createDisplay('2in13', 'mono', { gpio, spi });
        const image = await epd.loadPNG(file);
        assert.strictEqual(image.pixels[0], 0); // black
        assert.strictEqual(image.pixels[1], 1); // white

        const capped = createDisplay('2in13', 'mono', { gpio, spi, maxImagePixels: 3 });
        await assert.rejects(() => capped.loadPNG(file), /PNG too large/);
    } finally {
        fs.unlinkSync(file);
    }
});

// --- Runner ---------------------------------------------------------------

(async () => {
    let failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`  ok - ${name}`);
        } catch (error) {
            failed++;
            console.error(`  FAIL - ${name}`);
            console.error(`    ${error.message}`);
        }
    }
    console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
    if (failed > 0) process.exit(1);
})();
