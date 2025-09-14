const EPDBase = require('../EPDBase');

class EPD7in3f extends EPDBase {
    constructor(options = {}) {
        super(options);

        this.width = 800;
        this.height = 480;
        this.colorMode = '7color';
        this.bitsPerPixel = 4; // 4 bits per pixel to store 3-bit color values (with padding)

        // Override base colors to match hardware
        this.colors = {
            BLACK: 0x0,   // 000
            WHITE: 0x1,   // 001
            GREEN: 0x2,   // 010
            BLUE: 0x3,    // 011
            RED: 0x4,     // 100
            YELLOW: 0x5,  // 101
            ORANGE: 0x6,  // 110
            CLEAN: 0x7    // 111 - unavailable/afterimage
        };

        this.initializeBuffer();
    }

    initializeBuffer() {
        // 7-color displays pack 2 pixels per byte (4 bits each, but only 3 bits used)
        const totalPixels = this.width * this.height;
        this.imageBuffer = Buffer.alloc(Math.ceil(totalPixels / 2));
        // Initialize with white pixels
        this.imageBuffer.fill(0x11); // Each nibble = 1 (WHITE)
    }

    async initDisplay() {
        await this.waitUntilIdle();

        // Software reset
        await this.sendCommand(0x12);
        await this.waitUntilIdle();

        // Auto measure VCOM
        await this.sendCommand(0x80);
        await this.sendData(0xA5);

        // Read VCOM value
        await this.sendCommand(0x81);

        // Data start transmission 1
        await this.sendCommand(0x10);
        await this.delay(2);

        // Data start transmission 2
        await this.sendCommand(0x13);
        await this.delay(2);

        // Dual SPI mode
        await this.sendCommand(0x3C);
        await this.sendData(0x60);

        // Resolution setting
        await this.sendCommand(0x61);
        await this.sendData([
            (this.width >> 8) & 0xFF,  // Width high byte
            this.width & 0xFF,          // Width low byte
            (this.height >> 8) & 0xFF, // Height high byte
            this.height & 0xFF          // Height low byte
        ]);

        // IC setting
        await this.sendCommand(0x30);
        await this.sendData(0x3C);

        await this.waitUntilIdle();
    }

    async displayImage() {
        // Data start transmission 2 (for 7-color data)
        await this.sendCommand(0x13);

        // Send image data in chunks
        const chunkSize = 4096;
        for (let i = 0; i < this.imageBuffer.length; i += chunkSize) {
            const chunk = this.imageBuffer.slice(i, Math.min(i + chunkSize, this.imageBuffer.length));
            await this.sendData(Array.from(chunk));
        }

        // Display refresh
        await this.sendCommand(0x12);
        await this.waitUntilIdle();
    }

    async show7Block() {
        // Special function to show all 7 colors in blocks for testing
        await this.clear();

        const blockWidth = Math.floor(this.width / 7);
        const colors = [
            this.colors.BLACK,
            this.colors.WHITE,
            this.colors.GREEN,
            this.colors.BLUE,
            this.colors.RED,
            this.colors.YELLOW,
            this.colors.ORANGE
        ];

        for (let i = 0; i < 7; i++) {
            const startX = i * blockWidth;
            const endX = (i === 6) ? this.width - 1 : (i + 1) * blockWidth - 1;

            this.drawRect(startX, 0, endX - startX + 1, this.height, colors[i], true);
        }

        await this.display();
    }

    // Override setPixel for optimized 7-color handling
    setPixel(x, y, color) {
        if (x >= this.width || y >= this.height || x < 0 || y < 0) {
            return;
        }

        const pixelIndex = x + y * this.width;
        const byteIndex = Math.floor(pixelIndex / 2);
        const pixelPos = pixelIndex % 2;

        // Ensure color is in valid range
        const validColor = Math.max(0, Math.min(7, color));

        if (pixelPos === 0) {
            // First pixel (upper 4 bits)
            this.imageBuffer[byteIndex] = (this.imageBuffer[byteIndex] & 0x0F) | ((validColor & 0x0F) << 4);
        } else {
            // Second pixel (lower 4 bits)
            this.imageBuffer[byteIndex] = (this.imageBuffer[byteIndex] & 0xF0) | (validColor & 0x0F);
        }
    }

    // Convenience methods for color drawing
    drawColorRect(x, y, width, height, colorName, filled = false) {
        const color = this.colors[colorName] !== undefined ? this.colors[colorName] : this.colors.WHITE;
        this.drawRect(x, y, width, height, color, filled);
    }

    drawColorLine(x0, y0, x1, y1, colorName) {
        const color = this.colors[colorName] !== undefined ? this.colors[colorName] : this.colors.WHITE;
        this.drawLine(x0, y0, x1, y1, color);
    }

    // Factory method
    static create(options = {}) {
        return new EPD7in3f(options);
    }
}

module.exports = {
    EPD7in3f,
    create7Color: (options) => EPD7in3f.create(options)
};