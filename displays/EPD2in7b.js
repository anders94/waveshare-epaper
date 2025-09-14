const EPDBase = require('../EPDBase');

class EPD2in7b extends EPDBase {
    constructor(options = {}) {
        super(options);

        this.width = 176;
        this.height = 264;
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

        // Driver output control
        await this.sendCommand(0x01);
        await this.sendData([(this.height - 1) % 256, Math.floor((this.height - 1) / 256), 0x00]);

        // Booster soft start control
        await this.sendCommand(0x0C);
        await this.sendData([0xD7, 0xD6, 0x9D]);

        // VCOM setting
        await this.sendCommand(0x2C);
        await this.sendData(0xA8);

        // Data entry mode setting
        await this.sendCommand(0x11);
        await this.sendData(0x01);

        // Set RAM X - address start / end position
        await this.sendCommand(0x44);
        await this.sendData([0x00, Math.floor((this.width - 1) / 8)]);

        // Set RAM Y - address start / end position
        await this.sendCommand(0x45);
        await this.sendData([0x00, 0x00, (this.height - 1) % 256, Math.floor((this.height - 1) / 256)]);

        // Set cursor position
        await this.sendCommand(0x4E);
        await this.sendData(0x00);
        await this.sendCommand(0x4F);
        await this.sendData([0x00, 0x00]);

        await this.waitUntilIdle();
    }

    async displayImage() {
        // Set cursor position for black/white data
        await this.sendCommand(0x4E);
        await this.sendData(0x00);
        await this.sendCommand(0x4F);
        await this.sendData([0x00, 0x00]);

        // Write black/white data
        await this.sendCommand(0x24);
        const chunkSize = 1024;

        // Send black/white image data
        for (let i = 0; i < this.imageBuffer.length; i += chunkSize) {
            const chunk = this.imageBuffer.slice(i, Math.min(i + chunkSize, this.imageBuffer.length));
            await this.sendData(Array.from(chunk));
        }

        // Set cursor position for color data
        await this.sendCommand(0x4E);
        await this.sendData(0x00);
        await this.sendCommand(0x4F);
        await this.sendData([0x00, 0x00]);

        // Write red data
        await this.sendCommand(0x26);

        // Send color buffer data
        if (this.colorBuffer) {
            for (let i = 0; i < this.colorBuffer.length; i += chunkSize) {
                const chunk = this.colorBuffer.slice(i, Math.min(i + chunkSize, this.colorBuffer.length));
                await this.sendData(Array.from(chunk));
            }
        } else {
            // Send empty color data if no color buffer
            const emptyChunk = Buffer.alloc(Math.min(chunkSize, this.imageBuffer.length), 0x00);
            for (let i = 0; i < this.imageBuffer.length; i += chunkSize) {
                const currentChunkSize = Math.min(chunkSize, this.imageBuffer.length - i);
                await this.sendData(Array.from(emptyChunk.slice(0, currentChunkSize)));
            }
        }

        // Display update
        await this.sendCommand(0x22);
        await this.sendData(0xF7);
        await this.sendCommand(0x20);
        await this.waitUntilIdle();
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

    // Create test pattern showing all three colors
    async show3ColorTest() {
        await this.clear();

        const third = Math.floor(this.width / 3);

        // Black section
        this.drawRect(0, 0, third, this.height, 0, true);

        // Red section
        this.drawRect(third * 2, 0, this.width - (third * 2), this.height, 2, true);

        // Add some test patterns
        this.drawRect(10, 10, 30, 30, 0, false); // Black outline
        this.drawRect(third + 10, 10, 30, 30, 2, false); // Red outline

        await this.display();
    }

    // Factory methods
    static create(accentColor = 'red', options = {}) {
        return new EPD2in7b({ ...options, accentColor });
    }
}

module.exports = {
    EPD2in7b,
    create3Color: (accentColor = 'red', options) => EPD2in7b.create(accentColor, options)
};