const EPDBase = require('../EPDBase');

class EPD13in3k extends EPDBase {
    constructor(options = {}) {
        super(options);

        this.width = 960;
        this.height = 680;
        this.colorMode = options.colorMode || 'mono'; // 'mono' or '4gray'
        this.bitsPerPixel = this.colorMode === '4gray' ? 2 : 1;

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

        // Data entry mode
        await this.sendCommand(0x11);
        await this.sendData(0x03);

        // Set window (full screen)
        await this.setWindow(0, 0, this.width - 1, this.height - 1);

        // Border setting
        await this.sendCommand(0x3C);
        await this.sendData(this.colorMode === '4gray' ? 0x00 : 0x01);

        // Temperature sensor control
        await this.sendCommand(0x18);
        await this.sendData(0x80);

        // Set cursor to origin
        await this.setCursor(0, 0);

        // Load 4-grayscale LUT if needed
        if (this.colorMode === '4gray') {
            await this.load4GrayLUT();
        }

        await this.waitUntilIdle();
    }

    async load4GrayLUT() {
        const LUT_DATA_4Gray = [
            0x80, 0x48, 0x4A, 0x22, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x0A, 0x48, 0x68, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x88, 0x48, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0xA8, 0x48, 0x45, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x07, 0x23, 0x17, 0x02, 0x00,
            0x05, 0x01, 0x05, 0x01, 0x02,
            0x08, 0x02, 0x01, 0x04, 0x04,
            0x00, 0x02, 0x00, 0x02, 0x01,
            0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01,
            0x22, 0x22, 0x22, 0x22, 0x22,
            0x17, 0x41, 0xA8, 0x32, 0x30,
            0x00, 0x00
        ];

        await this.sendCommand(0x32);
        for (let i = 0; i < LUT_DATA_4Gray.length; i++) {
            await this.sendData(LUT_DATA_4Gray[i]);
        }
    }

    async displayImage() {
        // Set cursor to start position
        await this.setCursor(0, 0);

        // Write RAM (black and white)
        await this.sendCommand(0x24);

        // Send image data in chunks
        const chunkSize = 4096;
        for (let i = 0; i < this.imageBuffer.length; i += chunkSize) {
            const chunk = this.imageBuffer.slice(i, Math.min(i + chunkSize, this.imageBuffer.length));
            await this.sendData(Array.from(chunk));
        }

        // Display update
        await this.sendCommand(0x22);
        await this.sendData(0xF7);
        await this.sendCommand(0x20);
        await this.waitUntilIdle();
    }

    // Factory method to create display with specific color mode
    static create(colorMode = 'mono', options = {}) {
        return new EPD13in3k({ ...options, colorMode });
    }
}

// Export both the class and factory methods
module.exports = {
    EPD13in3k,
    createMono: (options) => EPD13in3k.create('mono', options),
    create4Gray: (options) => EPD13in3k.create('4gray', options)
};