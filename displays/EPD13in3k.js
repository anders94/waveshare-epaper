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

    initializeBuffer() {
        if (this.colorMode === '4gray') {
            // For 4-gray mode, we need 2 bytes per monochrome byte (as per C code)
            const monoBufferSize = Math.ceil(this.width * this.height / 8);
            this.imageBuffer = Buffer.alloc(monoBufferSize * 2);
        } else {
            // Monochrome mode
            this.imageBuffer = Buffer.alloc(Math.ceil(this.width * this.height / 8));
        }
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

        if (this.colorMode === '4gray') {
            await this.display4Gray();
        } else {
            // Monochrome mode
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
    }

    async display4Gray() {
        const height = this.height;
        const width = Math.floor(this.width / 8);
        const totalPixels = height * width;

        // Prepare both buffers
        const buffer1 = Buffer.alloc(totalPixels);
        const buffer2 = Buffer.alloc(totalPixels);

        for (let i = 0; i < totalPixels; i++) {
            let temp3_1 = 0; // For first buffer
            let temp3_2 = 0; // For second buffer

            for (let j = 0; j < 2; j++) {
                let temp1 = this.imageBuffer[i * 2 + j];

                for (let k = 0; k < 2; k++) {
                    let temp2 = temp1 & 0xC0;

                    // First buffer logic
                    if (temp2 === 0xC0) {
                        temp3_1 |= 0x00; // White
                    } else if (temp2 === 0x00) {
                        temp3_1 |= 0x01; // Black
                    } else if (temp2 === 0x80) {
                        temp3_1 |= 0x01; // Gray1
                    } else { // 0x40
                        temp3_1 |= 0x00; // Gray2
                    }

                    // Second buffer logic
                    if (temp2 === 0xC0) {
                        temp3_2 |= 0x00; // White
                    } else if (temp2 === 0x00) {
                        temp3_2 |= 0x01; // Black
                    } else if (temp2 === 0x80) {
                        temp3_2 |= 0x00; // Gray1
                    } else { // 0x40
                        temp3_2 |= 0x01; // Gray2
                    }

                    temp3_1 <<= 1;
                    temp3_2 <<= 1;

                    temp1 <<= 2;
                    temp2 = temp1 & 0xC0;

                    // First buffer logic
                    if (temp2 === 0xC0) {
                        temp3_1 |= 0x00;
                    } else if (temp2 === 0x00) {
                        temp3_1 |= 0x01;
                    } else if (temp2 === 0x80) {
                        temp3_1 |= 0x01;
                    } else { // 0x40
                        temp3_1 |= 0x00;
                    }

                    // Second buffer logic
                    if (temp2 === 0xC0) {
                        temp3_2 |= 0x00;
                    } else if (temp2 === 0x00) {
                        temp3_2 |= 0x01;
                    } else if (temp2 === 0x80) {
                        temp3_2 |= 0x00;
                    } else { // 0x40
                        temp3_2 |= 0x01;
                    }

                    if (!(j === 1 && k === 1)) {
                        temp3_1 <<= 1;
                        temp3_2 <<= 1;
                    }

                    temp1 <<= 2;
                }
            }

            buffer1[i] = temp3_1;
            buffer2[i] = temp3_2;
        }

        // Send first buffer (0x24 command)
        await this.sendCommand(0x24);
        const chunkSize = 4096;
        for (let i = 0; i < buffer1.length; i += chunkSize) {
            const chunk = buffer1.slice(i, Math.min(i + chunkSize, buffer1.length));
            await this.sendData(Array.from(chunk));
        }

        // Send second buffer (0x26 command)
        await this.sendCommand(0x26);
        for (let i = 0; i < buffer2.length; i += chunkSize) {
            const chunk = buffer2.slice(i, Math.min(i + chunkSize, buffer2.length));
            await this.sendData(Array.from(chunk));
        }

        // Display update for 4-gray
        await this.sendCommand(0x22);
        await this.sendData(0xC7);
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