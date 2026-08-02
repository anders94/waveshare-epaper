const fs = require('fs');
const { PNG } = require('pngjs');
const { createDefaultGpio, SpiDeviceBackend, validatePin } = require('./hal');
const { createFormat } = require('./formats');

class EPDBase {
    constructor(options = {}) {
        // SPI configuration
        this.busNumber = options.busNumber || 0;
        this.deviceNumber = options.deviceNumber || 0;
        this.spiOptions = {
            maxSpeedHz: options.maxSpeedHz || 4000000,
            mode: 0, // SPI mode 0
            bitsPerWord: 8
        };

        // GPIO pins (using gpiod for RPi5). Chip select is not listed here:
        // it is driven by the SPI controller's CE line, not a GPIO.
        this.pins = {
            RST: validatePin('rstPin', options.rstPin ?? 17),
            DC: validatePin('dcPin', options.dcPin ?? 25),
            BUSY: validatePin('busyPin', options.busyPin ?? 24),
            PWR: validatePin('pwrPin', options.pwrPin ?? 18)
        };
        if (options.csPin !== undefined) {
            console.warn("waveshare-epaper: csPin is ignored - chip select is driven by the SPI controller's CE line (deviceNumber selects CE0/CE1)");
        }
        this.gpioChip = options.gpioChip || 'gpiochip0';

        // How long waitUntilIdle() polls the BUSY pin before throwing
        this.busyTimeoutMs = options.busyTimeoutMs ?? 10000;

        // Sanity cap on PNG dimensions to prevent huge allocations from
        // malformed or hostile image files
        this.maxImagePixels = options.maxImagePixels ?? (1 << 24); // ~16.7M pixels

        // GPIO level of the BUSY pin while the panel is busy. SSD-family
        // controllers hold BUSY high while busy (the default); UC8176-class
        // and IT8951 controllers hold it low (those drivers override with 0).
        this.busyActiveLevel = 1;

        // Hardware backends - injectable for testing or alternate platforms
        // (see hal.js for the gpio/spi interfaces)
        this.gpio = options.gpio || createDefaultGpio(this.gpioChip);
        this.spi = options.spi || new SpiDeviceBackend(this.busNumber, this.deviceNumber, this.spiOptions);

        this.initialized = false;
        this.displayInProgress = false;

        // These will be set by subclasses
        this.width = 0;
        this.height = 0;
        this.colorMode = 'mono'; // 'mono', '4gray', '3color', '7color'
        this.bitsPerPixel = 1;
        this.imageBuffer = null;

        // Color buffer for dual-buffer displays (3-color, etc.)
        this.colorBuffer = null;

        // Color constants for 7-color displays
        this.colors = {
            BLACK: 0,
            WHITE: 1,
            GREEN: 2,
            BLUE: 3,
            RED: 4,
            YELLOW: 5,
            ORANGE: 6
        };
    }

    // Pixel format strategy for the current color mode (see formats.js).
    // Created lazily because subclasses set colorMode after super() runs.
    // Null for modes without a format (the experimental 16gray driver
    // overrides the pixel operations itself).
    get format() {
        if (this._formatMode !== this.colorMode) {
            this._format = createFormat(this.colorMode, this.colors);
            this._formatMode = this.colorMode;
        }
        return this._format;
    }

    initializeBuffer() {
        const totalBits = this.width * this.height * this.bitsPerPixel;
        this.imageBuffer = Buffer.alloc(Math.ceil(totalBits / 8));

        // Initialize color buffer for 3-color displays
        if (this.format && this.format.usesColorBuffer) {
            this.colorBuffer = Buffer.alloc(Math.ceil(this.width * this.height / 8));
        }
    }

    async init() {
        try {
            // Initialize SPI device
            await this.spi.open();

            // Initialize GPIO pins
            await this.initGPIO();

            // Hardware reset
            await this.reset();

            // Display-specific initialization (implemented by subclasses)
            await this.initDisplay();

            this.initialized = true;
        } catch (error) {
            throw new Error(`Failed to initialize EPD: ${error.message}`);
        }
    }

    async initGPIO() {
        // Initialize output pins to high (skip BUSY pin which is input)
        for (const [name, pin] of Object.entries(this.pins)) {
            if (name !== 'BUSY') {
                await this.writeGPIO(pin, 1);
            }
        }
    }

    async reset() {
        await this.writeGPIO(this.pins.RST, 1);
        await this.delay(200);
        await this.writeGPIO(this.pins.RST, 0);
        await this.delay(2);
        await this.writeGPIO(this.pins.RST, 1);
        await this.delay(200);
    }

    async writeGPIO(pin, value) {
        return this.gpio.write(pin, value);
    }

    async readGPIO(pin) {
        return this.gpio.read(pin);
    }

    async sendCommand(command) {
        await this.writeGPIO(this.pins.DC, 0);
        await this.spi.transfer(Buffer.from([command]));
    }

    async sendData(data) {
        await this.writeGPIO(this.pins.DC, 1);

        let buffer;
        if (Buffer.isBuffer(data)) {
            buffer = data;
        } else if (Array.isArray(data)) {
            buffer = Buffer.from(data);
        } else {
            buffer = Buffer.from([data]);
        }

        await this.spi.transfer(buffer);
    }

    // Send a large buffer as display data, chunked to stay under the SPI
    // driver's per-transfer limit (spidev bufsiz defaults to 4096 bytes)
    async sendBuffer(buffer, chunkSize = 4096) {
        await this.writeGPIO(this.pins.DC, 1);

        for (let i = 0; i < buffer.length; i += chunkSize) {
            await this.spi.transfer(buffer.subarray(i, Math.min(i + chunkSize, buffer.length)));
        }
    }

    async waitUntilIdle() {
        const pollMs = 100;
        const maxPolls = Math.ceil(this.busyTimeoutMs / pollMs);
        let polls = 0;

        while (await this.readGPIO(this.pins.BUSY) === this.busyActiveLevel) {
            await this.delay(pollMs);
            polls++;

            if (polls >= maxPolls) {
                throw new Error(`Display busy timeout after ${this.busyTimeoutMs}ms - check wiring and busyPin setting`);
            }
        }
    }

    async setWindow(xStart, yStart, xEnd, yEnd) {
        // Set RAM X address window
        await this.sendCommand(0x44);
        await this.sendData([
            xStart & 0xFF,
            (xStart >> 8) & 0x03,
            xEnd & 0xFF,
            (xEnd >> 8) & 0x03
        ]);

        // Set RAM Y address window
        await this.sendCommand(0x45);
        await this.sendData([
            yStart & 0xFF,
            (yStart >> 8) & 0x03,
            yEnd & 0xFF,
            (yEnd >> 8) & 0x03
        ]);
    }

    async setCursor(x, y) {
        // Set RAM X address counter
        await this.sendCommand(0x4E);
        await this.sendData([x & 0xFF, (x >> 8) & 0x03]);

        // Set RAM Y address counter
        await this.sendCommand(0x4F);
        await this.sendData([y & 0xFF, (y >> 8) & 0x03]);
    }

    async clear() {
        if (this.format) {
            this.format.clear({ image: this.imageBuffer, color: this.colorBuffer });
        }
        await this.display();
    }

    async display() {
        if (!this.initialized) {
            throw new Error('Display not initialized. Call init() first.');
        }
        if (this.displayInProgress) {
            throw new Error('display() already in progress - concurrent refreshes would corrupt the panel data stream');
        }

        this.displayInProgress = true;
        try {
            // Display-specific implementation (implemented by subclasses)
            await this.displayImage();
        } finally {
            this.displayInProgress = false;
        }
    }

    // Abstract methods to be implemented by subclasses
    async initDisplay() {
        throw new Error('initDisplay() must be implemented by subclass');
    }

    async displayImage() {
        throw new Error('displayImage() must be implemented by subclass');
    }

    // Common pixel manipulation methods
    setPixel(x, y, color) {
        if (x >= this.width || y >= this.height || x < 0 || y < 0) {
            return;
        }

        if (this.format) {
            this.format.setPixel({ image: this.imageBuffer, color: this.colorBuffer }, this.width, x, y, color);
        }
    }

    // Set pixel with color name for 7-color displays
    setPixelColor(x, y, colorName) {
        if (this.colorMode === '7color' && this.colors[colorName] !== undefined) {
            this.setPixel(x, y, this.colors[colorName]);
        } else {
            // For other modes, convert color names to appropriate values
            const colorMap = {
                'BLACK': 0,
                'WHITE': 1,
                'RED': this.colorMode === '3color' ? 2 : 4,
                'YELLOW': this.colorMode === '3color' ? 2 : 5,
                'GREEN': 2,
                'BLUE': 3,
                'ORANGE': 6
            };
            const colorValue = colorMap[colorName] !== undefined ? colorMap[colorName] : 1;
            this.setPixel(x, y, colorValue);
        }
    }

    drawLine(x0, y0, x1, y1, color) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        let x = x0;
        let y = y0;

        while (true) {
            this.setPixel(x, y, color);

            if (x === x1 && y === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }
    }

    drawRect(x, y, width, height, color, filled = false) {
        if (filled) {
            for (let i = 0; i < height; i++) {
                this.drawLine(x, y + i, x + width - 1, y + i, color);
            }
        } else {
            this.drawLine(x, y, x + width - 1, y, color);
            this.drawLine(x, y, x, y + height - 1, color);
            this.drawLine(x + width - 1, y, x + width - 1, y + height - 1, color);
            this.drawLine(x, y + height - 1, x + width - 1, y + height - 1, color);
        }
    }

    // Convert RGB color to display format based on color mode
    rgbToColor(r, g, b) {
        return this.format ? this.format.rgbToColor(r, g, b) : 0;
    }

    // Keep backward compatibility
    rgbToGrayscale(r, g, b) {
        return this.rgbToColor(r, g, b);
    }

    // Load PNG file and convert to display format
    async loadPNG(filePath) {
        const self = this;
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(new PNG())
                .on('parsed', function() {
                    if (this.width * this.height > self.maxImagePixels) {
                        reject(new Error(`PNG too large: ${this.width}x${this.height} exceeds the ${self.maxImagePixels} pixel limit (maxImagePixels option)`));
                        return;
                    }

                    const imageData = {
                        width: this.width,
                        height: this.height,
                        pixels: new Uint8Array(this.width * this.height)
                    };

                    // Convert RGBA pixels to display format
                    for (let y = 0; y < this.height; y++) {
                        for (let x = 0; x < this.width; x++) {
                            const idx = (this.width * y + x) << 2;
                            const r = this.data[idx];
                            const g = this.data[idx + 1];
                            const b = this.data[idx + 2];
                            const a = this.data[idx + 3];

                            // Handle transparency - treat transparent as white/background
                            const pixelValue = (a < 128)
                                ? (self.format ? self.format.background : 1)
                                : self.rgbToColor(r, g, b);

                            imageData.pixels[y * this.width + x] = pixelValue;
                        }
                    }

                    resolve(imageData);
                })
                .on('error', reject);
        });
    }

    // Draw PNG image at specified coordinates
    async drawPNG(filePath, x = 0, y = 0) {
        const imageData = await this.loadPNG(filePath);

        console.log(`Drawing PNG: ${imageData.width}x${imageData.height} at (${x}, ${y})`);

        // Draw each pixel, checking bounds
        for (let py = 0; py < imageData.height; py++) {
            for (let px = 0; px < imageData.width; px++) {
                const screenX = x + px;
                const screenY = y + py;

                // Skip pixels outside display bounds
                if (screenX >= this.width || screenY >= this.height || screenX < 0 || screenY < 0) {
                    continue;
                }

                const pixelValue = imageData.pixels[py * imageData.width + px];
                this.setPixel(screenX, screenY, pixelValue);
            }
        }
    }

    // Draw Canvas object at specified coordinates
    async drawCanvas(canvas, x = 0, y = 0) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        console.log(`Drawing Canvas: ${canvas.width}x${canvas.height} at (${x}, ${y})`);

        // Draw each pixel, checking bounds
        for (let py = 0; py < canvas.height; py++) {
            for (let px = 0; px < canvas.width; px++) {
                const screenX = x + px;
                const screenY = y + py;

                // Skip pixels outside display bounds
                if (screenX >= this.width || screenY >= this.height || screenX < 0 || screenY < 0) {
                    continue;
                }

                const dataIndex = (py * canvas.width + px) * 4;
                const r = imageData.data[dataIndex];
                const g = imageData.data[dataIndex + 1];
                const b = imageData.data[dataIndex + 2];
                const a = imageData.data[dataIndex + 3];

                // Handle transparency - treat transparent as white/background
                const pixelValue = (a < 128)
                    ? (this.format ? this.format.background : 1)
                    : this.rgbToColor(r, g, b);

                this.setPixel(screenX, screenY, pixelValue);
            }
        }
    }

    async powerOn() {
        await this.writeGPIO(this.pins.PWR, 1);
        await this.delay(100);
    }

    async powerOff() {
        await this.writeGPIO(this.pins.PWR, 0);
        await this.delay(100);
    }

    async sleep() {
        await this.sendCommand(0x10);
        await this.sendData(0x01);
    }

    async cleanup() {
        // Put the panel into deep sleep before cutting power - leaving
        // e-paper active with a static charge degrades the panel over time
        if (this.initialized) {
            try {
                await this.sleep();
            } catch (error) {
                // Ignore errors during cleanup
            }
        }

        try {
            this.spi.close();
        } catch (error) {
            // Ignore errors during cleanup
        }

        // Power down the display
        try {
            await this.powerOff();
        } catch (error) {
            // Ignore errors during cleanup
        }

        // Release GPIO lines if the backend holds any
        try {
            if (typeof this.gpio.release === 'function') {
                await this.gpio.release();
            }
        } catch (error) {
            // Ignore errors during cleanup
        }

        this.initialized = false;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = EPDBase;
