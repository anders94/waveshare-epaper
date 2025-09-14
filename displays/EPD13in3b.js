const EPDBase = require('../EPDBase');

class EPD13in3b extends EPDBase {
    constructor(options = {}) {
        super(options);

        this.width = 960;
        this.height = 680;
        this.colorMode = '3color';
        this.bitsPerPixel = 1; // 1 bit per pixel for each buffer
        this.accentColor = options.accentColor || 'red'; // 'red' or 'yellow'

        this.initializeBuffer();
    }

    async initDisplay() {
        await this.waitUntilIdle();

        // Software reset
        await this.sendCommand(0x12);
        await this.waitUntilIdle();

        // Set soft start
        await this.sendCommand(0x0C);
        await this.sendData([0xAE, 0xC7, 0xC3, 0xC0, 0x80]);

        // Drive output control
        await this.sendCommand(0x01);
        await this.sendData([(this.height - 1) % 256, Math.floor((this.height - 1) / 256), 0x00]);

        // Data entry mode setting
        await this.sendCommand(0x11);
        await this.sendData(0x03);

        // Set window (full screen)
        await this.setWindow(0, 0, this.width - 1, this.height - 1);

        // Border waveform control
        await this.sendCommand(0x3C);
        await this.sendData(0x01);

        // Temperature sensor control
        await this.sendCommand(0x18);
        await this.sendData(0x80);

        // Set cursor to origin
        await this.setCursor(0, 0);

        await this.waitUntilIdle();
    }

    async displayImage() {
        // Set cursor to start position
        await this.setCursor(0, 0);

        // Write black/white data
        await this.sendCommand(0x24);
        const chunkSize = 4096;

        // Send black/white image data
        for (let i = 0; i < this.imageBuffer.length; i += chunkSize) {
            const chunk = this.imageBuffer.slice(i, Math.min(i + chunkSize, this.imageBuffer.length));
            await this.sendData(Array.from(chunk));
        }

        // Set cursor again for color data
        await this.setCursor(0, 0);

        // Write red/yellow data
        await this.sendCommand(0x26);

        // Send color buffer data
        if (this.colorBuffer) {
            for (let i = 0; i < this.colorBuffer.length; i += chunkSize) {
                const chunk = this.colorBuffer.slice(i, Math.min(i + chunkSize, this.colorBuffer.length));
                await this.sendData(Array.from(chunk));
            }
        } else {
            // Send empty color data if no color buffer
            const emptyChunk = Buffer.alloc(Math.min(chunkSize, Math.ceil(this.width * this.height / 8)), 0x00);
            const totalBytes = Math.ceil(this.width * this.height / 8);
            for (let i = 0; i < totalBytes; i += chunkSize) {
                const currentChunkSize = Math.min(chunkSize, totalBytes - i);
                await this.sendData(Array.from(emptyChunk.slice(0, currentChunkSize)));
            }
        }

        // Display update
        await this.sendCommand(0x22);
        await this.sendData(0xF7);
        await this.sendCommand(0x20);
        await this.waitUntilIdle();
    }

    async clearBlack() {
        this.imageBuffer.fill(0x00);
        if (this.colorBuffer) this.colorBuffer.fill(0x00);
        await this.display();
    }

    async clearRed() {
        this.imageBuffer.fill(0xFF);
        if (this.colorBuffer) this.colorBuffer.fill(0xFF);
        await this.display();
    }

    // Convenience methods for 3-color drawing
    drawRedRect(x, y, width, height, filled = false) {
        this.drawRect(x, y, width, height, 2, filled);
    }

    drawRedLine(x0, y0, x1, y1) {
        this.drawLine(x0, y0, x1, y1, 2);
    }

    drawBlackRect(x, y, width, height, filled = false) {
        this.drawRect(x, y, width, height, 0, filled);
    }

    drawBlackLine(x0, y0, x1, y1) {
        this.drawLine(x0, y0, x1, y1, 0);
    }

    // Set individual pixels with color names
    setRedPixel(x, y) {
        this.setPixel(x, y, 2);
    }

    setBlackPixel(x, y) {
        this.setPixel(x, y, 0);
    }

    setWhitePixel(x, y) {
        this.setPixel(x, y, 1);
    }

    // Create test pattern showing all three colors
    async show3ColorTest() {
        await this.clear();

        const third = Math.floor(this.width / 3);

        // Black section
        this.drawRect(0, 0, third, this.height, 0, true);

        // White section (default background)
        // No need to draw anything for white

        // Red section
        this.drawRect(third * 2, 0, this.width - (third * 2), this.height, 2, true);

        // Add some test patterns
        this.drawRect(50, 50, 100, 100, 0, false); // Black outline
        this.drawRect(third + 50, 50, 100, 100, 2, false); // Red outline
        this.drawRect(third * 2 + 50, 50, 100, 100, 1, false); // White outline (visible on red)

        await this.display();
    }

    // Factory methods
    static create(accentColor = 'red', options = {}) {
        return new EPD13in3b({ ...options, accentColor });
    }
}

module.exports = {
    EPD13in3b,
    create3Color: (accentColor = 'red', options) => EPD13in3b.create(accentColor, options),
    createRed: (options) => EPD13in3b.create('red', options),
    createYellow: (options) => EPD13in3b.create('yellow', options)
};