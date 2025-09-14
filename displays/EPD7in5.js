const EPDBase = require('../EPDBase');

class EPD7in5 extends EPDBase {
    constructor(options = {}) {
        super(options);

        this.width = 640;
        this.height = 384;
        this.colorMode = 'mono'; // 7.5" is monochrome only
        this.bitsPerPixel = 1;

        this.initializeBuffer();
    }

    async initDisplay() {
        await this.waitUntilIdle();

        // Software reset
        await this.sendCommand(0x12);
        await this.waitUntilIdle();

        // Panel setting
        await this.sendCommand(0x00);
        await this.sendData(0x1F);

        // Power setting
        await this.sendCommand(0x01);
        await this.sendData([0x03, 0x00, 0x2b, 0x2b]);

        // Power on
        await this.sendCommand(0x04);
        await this.waitUntilIdle();

        // Booster soft start
        await this.sendCommand(0x06);
        await this.sendData([0x17, 0x17, 0x17]);

        // Data start transmission
        await this.sendCommand(0x10);

        // Initialize with white
        const totalBytes = this.width * this.height / 8;
        const chunkSize = 4096;
        const whiteBuffer = Buffer.alloc(Math.min(chunkSize, totalBytes), 0xFF);

        for (let i = 0; i < totalBytes; i += chunkSize) {
            const currentChunkSize = Math.min(chunkSize, totalBytes - i);
            const chunk = whiteBuffer.slice(0, currentChunkSize);
            await this.sendData(Array.from(chunk));
        }

        // Set resolution
        await this.sendCommand(0x61);
        await this.sendData([
            (this.width >> 8) & 0xFF,
            this.width & 0xFF,
            (this.height >> 8) & 0xFF,
            this.height & 0xFF
        ]);

        // VCM DC setting
        await this.sendCommand(0x82);
        await this.sendData(0x12);

        // VCOM and data interval setting
        await this.sendCommand(0x50);
        await this.sendData(0x87);
    }

    async displayImage() {
        // Data start transmission
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
}

module.exports = {
    EPD7in5,
    createMono: (options) => new EPD7in5(options)
};