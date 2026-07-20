// Hardware-free tests using injected mock GPIO/SPI backends (see hal.js).
// Run with: npm test

const assert = require('assert');
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
