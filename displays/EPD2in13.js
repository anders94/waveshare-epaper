const EPDBase = require('../EPDBase');

class EPD2in13 extends EPDBase {
    constructor(options = {}) {
        super(options);

        this.width = 122;
        this.height = 250;
        this.colorMode = 'mono'; // 2.13" is monochrome only
        this.bitsPerPixel = 1;

        this.initializeBuffer();
    }

    async initDisplay() {
        await this.waitUntilIdle();

        // Software reset
        await this.sendCommand(0x12);
        await this.waitUntilIdle();

        // Set analog block control
        await this.sendCommand(0x74);
        await this.sendData(0x54);

        // Set digital block control
        await this.sendCommand(0x7E);
        await this.sendData(0x3B);

        // Driver output control
        await this.sendCommand(0x01);
        await this.sendData([(this.height - 1) % 256, Math.floor((this.height - 1) / 256), 0x00]);

        // Data entry mode setting
        await this.sendCommand(0x11);
        await this.sendData(0x03);

        // Set RAM X - address start / end position
        await this.sendCommand(0x44);
        await this.sendData([0x00, Math.floor((this.width - 1) / 8)]);

        // Set RAM Y - address start / end position
        await this.sendCommand(0x45);
        await this.sendData([0x00, 0x00, (this.height - 1) % 256, Math.floor((this.height - 1) / 256)]);

        // Border waveform control
        await this.sendCommand(0x3C);
        await this.sendData(0x03);

        // Temperature sensor control
        await this.sendCommand(0x18);
        await this.sendData(0x80);

        // Set cursor position
        await this.sendCommand(0x4E);
        await this.sendData(0x00);
        await this.sendCommand(0x4F);
        await this.sendData([0x00, 0x00]);

        await this.waitUntilIdle();
    }

    async displayImage() {
        // Set cursor to start position
        await this.sendCommand(0x4E);
        await this.sendData(0x00);
        await this.sendCommand(0x4F);
        await this.sendData([0x00, 0x00]);

        // Write RAM
        await this.sendCommand(0x24);

        // Send image data
        const chunkSize = 1024;
        for (let i = 0; i < this.imageBuffer.length; i += chunkSize) {
            const chunk = this.imageBuffer.slice(i, Math.min(i + chunkSize, this.imageBuffer.length));
            await this.sendData(Array.from(chunk));
        }

        // Display update sequence
        await this.sendCommand(0x22);
        await this.sendData(0xF7);
        await this.sendCommand(0x20);
        await this.waitUntilIdle();
    }
}

module.exports = {
    EPD2in13,
    createMono: (options) => new EPD2in13(options)
};