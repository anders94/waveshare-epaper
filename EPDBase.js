const spi = require('spi-device');
const fs = require('fs');
const { PNG } = require('pngjs');

class EPDBase {
    constructor(options = {}) {
        // SPI configuration
        this.busNumber = options.busNumber || 0;
        this.deviceNumber = options.deviceNumber || 0;
        this.spiOptions = {
            maxSpeedHz: options.maxSpeedHz || 4000000,
            mode: spi.MODE0,
            bitsPerWord: 8
        };

        // GPIO pins (using gpiod for RPi5)
        this.pins = {
            RST: options.rstPin || 17,
            DC: options.dcPin || 25,
            CS: options.csPin || 8,
            BUSY: options.busyPin || 24,
            PWR: options.pwrPin || 18
        };
        this.gpioChip = options.gpioChip || 'gpiochip0';

        this.spiDevice = null;
        this.initialized = false;

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

    initializeBuffer() {
        const totalBits = this.width * this.height * this.bitsPerPixel;
        this.imageBuffer = Buffer.alloc(Math.ceil(totalBits / 8));

        // Initialize color buffer for 3-color displays
        if (this.colorMode === '3color') {
            this.colorBuffer = Buffer.alloc(Math.ceil(this.width * this.height / 8));
        }
    }

    async init() {
        try {
            // Initialize SPI device
            this.spiDevice = spi.openSync(this.busNumber, this.deviceNumber, this.spiOptions);

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
        const { exec } = require('child_process');
        return new Promise((resolve, reject) => {
            exec(`gpioset ${this.gpioChip} ${pin}=${value}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Failed to set GPIO ${pin}: ${error.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    async readGPIO(pin) {
        const { exec } = require('child_process');
        return new Promise((resolve, reject) => {
            exec(`gpioget ${this.gpioChip} ${pin}`, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Failed to read GPIO ${pin}: ${error.message}`));
                } else {
                    resolve(parseInt(stdout.trim()));
                }
            });
        });
    }

    async sendCommand(command) {
        await this.writeGPIO(this.pins.DC, 0);

        return new Promise((resolve, reject) => {
            this.spiDevice.transfer([{
                sendBuffer: Buffer.from([command]),
                receiveBuffer: Buffer.alloc(1),
                byteLength: 1
            }], (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async sendData(data) {
        await this.writeGPIO(this.pins.DC, 1);

        const buffer = Array.isArray(data) ? Buffer.from(data) : Buffer.from([data]);

        return new Promise((resolve, reject) => {
            this.spiDevice.transfer([{
                sendBuffer: buffer,
                receiveBuffer: Buffer.alloc(buffer.length),
                byteLength: buffer.length
            }], (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    async waitUntilIdle() {
        let timeout = 0;
        const maxTimeout = 100; // 10 seconds max wait

        while (await this.readGPIO(this.pins.BUSY) === 1) {
            await this.delay(100);
            timeout++;

            if (timeout >= maxTimeout) {
                console.log('Warning: Display busy timeout - continuing anyway');
                break;
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
        if (this.colorMode === 'mono') {
            this.imageBuffer.fill(0xFF);
        } else if (this.colorMode === '4gray') {
            this.imageBuffer.fill(0xFF); // All white pixels (3 = white in 4gray mode)
        } else if (this.colorMode === '3color') {
            this.imageBuffer.fill(0xFF); // White background
            if (this.colorBuffer) this.colorBuffer.fill(0x00); // No color
        } else if (this.colorMode === '7color') {
            this.imageBuffer.fill(0x11); // White pixels (all pixels set to WHITE = 1)
        }
        await this.display();
    }

    async display() {
        if (!this.initialized) {
            throw new Error('Display not initialized. Call init() first.');
        }

        // Display-specific implementation (implemented by subclasses)
        await this.displayImage();
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

        if (this.colorMode === 'mono') {
            const byteIndex = Math.floor((x + y * this.width) / 8);
            const bitIndex = 7 - ((x + y * this.width) % 8);

            if (color === 0) {
                // Black
                this.imageBuffer[byteIndex] &= ~(1 << bitIndex);
            } else {
                // White
                this.imageBuffer[byteIndex] |= (1 << bitIndex);
            }
        } else if (this.colorMode === '4gray') {
            const pixelIndex = x + y * this.width;
            const byteIndex = Math.floor(pixelIndex / 4);
            const pixelPos = pixelIndex % 4;
            const bitShift = (3 - pixelPos) * 2;

            // Clear the 2 bits for this pixel
            this.imageBuffer[byteIndex] &= ~(0x03 << bitShift);
            // Set the new value
            this.imageBuffer[byteIndex] |= ((color & 0x03) << bitShift);
        } else if (this.colorMode === '3color') {
            // For 3-color displays, color parameter can be:
            // 0 = black, 1 = white, 2 = red/yellow (accent color)
            const byteIndex = Math.floor((x + y * this.width) / 8);
            const bitIndex = 7 - ((x + y * this.width) % 8);

            if (color === 2) {
                // Accent color (red/yellow) - set in color buffer, clear in main buffer
                this.imageBuffer[byteIndex] |= (1 << bitIndex); // White in main buffer
                if (this.colorBuffer) {
                    this.colorBuffer[byteIndex] |= (1 << bitIndex); // Set color bit
                }
            } else if (color === 0) {
                // Black - clear in both buffers
                this.imageBuffer[byteIndex] &= ~(1 << bitIndex);
                if (this.colorBuffer) {
                    this.colorBuffer[byteIndex] &= ~(1 << bitIndex);
                }
            } else {
                // White - set in main buffer, clear in color buffer
                this.imageBuffer[byteIndex] |= (1 << bitIndex);
                if (this.colorBuffer) {
                    this.colorBuffer[byteIndex] &= ~(1 << bitIndex);
                }
            }
        } else if (this.colorMode === '7color') {
            // For 7-color displays, pack 2 pixels per byte (4 bits each, but only 3 bits used)
            const pixelIndex = x + y * this.width;
            const byteIndex = Math.floor(pixelIndex / 2);
            const pixelPos = pixelIndex % 2;

            if (pixelPos === 0) {
                // First pixel (upper 4 bits)
                this.imageBuffer[byteIndex] = (this.imageBuffer[byteIndex] & 0x0F) | ((color & 0x07) << 4);
            } else {
                // Second pixel (lower 4 bits)
                this.imageBuffer[byteIndex] = (this.imageBuffer[byteIndex] & 0xF0) | (color & 0x07);
            }
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
        if (this.colorMode === 'mono') {
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            return gray < 128 ? 0 : 1; // Black or white
        } else if (this.colorMode === '4gray') {
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            // Map to 4 levels: 0=black, 1=dark gray, 2=light gray, 3=white
            if (gray < 64) return 0;
            else if (gray < 128) return 1;
            else if (gray < 192) return 2;
            else return 3;
        } else if (this.colorMode === '3color') {
            // Simple color detection for 3-color displays
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            // Check if it's predominantly red or yellow
            if (r > g + 50 && r > b + 50 && r > 150) return 2; // Red-ish
            if (r > 150 && g > 150 && b < 100) return 2; // Yellow-ish

            // Otherwise black or white based on brightness
            return gray < 128 ? 0 : 1;
        } else if (this.colorMode === '7color') {
            // Advanced color detection for 7-color displays
            const maxComponent = Math.max(r, g, b);
            const minComponent = Math.min(r, g, b);

            // Very dark colors
            if (maxComponent < 50) return this.colors.BLACK;

            // Very bright colors
            if (minComponent > 200) return this.colors.WHITE;

            // Color detection based on dominant component
            if (r > g + 30 && r > b + 30) {
                // Red-dominant
                if (g > 150) return this.colors.ORANGE; // Red + Green = Orange
                return this.colors.RED;
            } else if (g > r + 30 && g > b + 30) {
                // Green-dominant
                if (r > 150) return this.colors.YELLOW; // Red + Green = Yellow
                return this.colors.GREEN;
            } else if (b > r + 30 && b > g + 30) {
                // Blue-dominant
                return this.colors.BLUE;
            }

            // Fallback to grayscale
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            return gray < 128 ? this.colors.BLACK : this.colors.WHITE;
        }

        return 0;
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
                    const imageData = {
                        width: this.width,
                        height: this.height,
                        pixels: new Array(this.width * this.height)
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
                            let pixelValue;
                            if (a < 128) {
                                // Transparent pixels become background color
                                if (self.colorMode === 'mono') pixelValue = 1; // White
                                else if (self.colorMode === '4gray') pixelValue = 3; // White
                                else if (self.colorMode === '3color') pixelValue = 1; // White
                                else if (self.colorMode === '7color') pixelValue = self.colors.WHITE;
                                else pixelValue = 1;
                            } else {
                                pixelValue = self.rgbToColor(r, g, b);
                            }

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
        if (this.spiDevice) {
            try {
                this.spiDevice.closeSync();
            } catch (error) {
                // Ignore errors during cleanup
            }
        }

        // Power down the display
        try {
            await this.powerOff();
        } catch (error) {
            // Ignore errors during cleanup
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = EPDBase;