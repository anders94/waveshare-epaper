const EPDBase = require('../EPDBase');

class EPD13in3Gray extends EPDBase {
    constructor(options = {}) {
        super(options);

        // 13.3 inch display with 1600x1200 resolution
        this.width = 1600;
        this.height = 1200;
        this.colorMode = '16gray';
        this.bitsPerPixel = 4; // 4 bits per pixel for 16 grayscale levels

        // IT8951 controller specific settings
        this.targetMemoryAddr = 0x001236E0; // Default target memory address
        this.vcom = options.vcom || -2.30; // Default VCOM voltage

        // IT8951 commands
        this.commands = {
            SYS_RUN: 0x0001,
            STANDBY: 0x0002,
            SLEEP: 0x0003,
            REG_RD: 0x0010,
            REG_WR: 0x0011,
            MEM_BST_RD_T: 0x0012,
            MEM_BST_RD_S: 0x0013,
            MEM_BST_WR: 0x0014,
            MEM_BST_END: 0x0015,
            LD_IMG: 0x0020,
            LD_IMG_AREA: 0x0021,
            LD_IMG_END: 0x0022,
            DPY_AREA: 0x0034,
            GET_DEV_INFO: 0x0302,
            DPY_BUF_AREA: 0x0037,
            VCOM: 0x0039
        };

        // IT8951 registers
        this.registers = {
            DISPLAY_REG_BASE: 0x1000,
            LUT0EWHR: 0x1000 + 0x00,
            LUT0XYR: 0x1000 + 0x40,
            LUT0BADDR: 0x1000 + 0x80,
            LUT0IMXY: 0x1000 + 0x84,
            LUT0BGVR: 0x1000 + 0x88,
            UP1SR: 0x1000 + 0x134,
            BGVR: 0x1000 + 0x140,
            AWVR: 0x1000 + 0x144,
            LUTAFSR: 0x1000 + 0x224,
            I80CPCR: 0x0004
        };

        // Display modes
        this.displayModes = {
            INIT: 0,    // Initialization mode
            DU: 1,      // Direct Update
            GC16: 2,    // 16-level grayscale
            GL16: 3,    // 16-level grayscale (faster)
            GLR16: 4,   // 16-level grayscale (reduced)
            GLD16: 5,   // 16-level grayscale (dithered)
            A2: 6       // 2-level grayscale (fastest)
        };

        this.initializeBuffer();
    }

    initializeBuffer() {
        // For 4bpp mode, each pixel takes 4 bits, so 2 pixels per byte
        const totalBytes = Math.ceil((this.width * this.height * this.bitsPerPixel) / 8);
        this.imageBuffer = Buffer.alloc(totalBytes);
    }

    async initDisplay() {
        await this.waitUntilIdle();

        // Get device info and system info
        const deviceInfo = await this.getDeviceInfo();
        console.log('IT8951 Device Info:', deviceInfo);

        // Enable I80 packed mode
        await this.writeRegister(this.registers.I80CPCR, 0x0001);

        // Set VCOM value
        await this.setVCOM(this.vcom);

        // Initialize display with INIT mode
        await this.displayArea(0, 0, this.width, this.height, this.displayModes.INIT);

        await this.waitUntilIdle();
    }

    async getDeviceInfo() {
        // Send GET_DEV_INFO command
        await this.sendCommand(this.commands.GET_DEV_INFO);

        // For real implementation, this would read the device info response
        // This is a placeholder that returns expected values
        return {
            panelWidth: this.width,
            panelHeight: this.height,
            imageBufferAddress: this.targetMemoryAddr,
            firmwareVersion: '0.2.4.3',
            lutVersion: '1.5'
        };
    }

    async setVCOM(voltage) {
        // Convert voltage to register value (voltage * 1000)
        const vcomValue = Math.abs(voltage * 1000);

        await this.sendCommand(this.commands.VCOM);
        await this.sendData([1]); // Set VCOM mode
        await this.sendData([
            (vcomValue >> 8) & 0xFF,
            vcomValue & 0xFF
        ]);
        await this.waitUntilIdle();
    }

    async writeRegister(register, value) {
        await this.sendCommand(this.commands.REG_WR);
        await this.sendData([
            (register >> 8) & 0xFF,
            register & 0xFF,
            (value >> 8) & 0xFF,
            value & 0xFF
        ]);
    }

    async loadImageArea(x, y, width, height, mode = 'GC16') {
        const displayMode = typeof mode === 'string' ? this.displayModes[mode] : mode;

        // Calculate buffer size for 4bpp
        const bufferSize = Math.ceil((width * height * 4) / 8);

        // Send LD_IMG_AREA command
        await this.sendCommand(this.commands.LD_IMG_AREA);

        // Send load image info structure
        const loadImgInfo = Buffer.allocUnsafe(20);
        loadImgInfo.writeUInt32LE(this.targetMemoryAddr, 0);  // Target memory address
        loadImgInfo.writeUInt32LE(bufferSize, 4);             // Source buffer size
        loadImgInfo.writeUInt16LE(0x0008, 8);                 // Pixel format (4bpp)
        loadImgInfo.writeUInt16LE(0x0000, 10);                // Endian type (little)
        loadImgInfo.writeUInt16LE(0x0000, 12);                // Rotate
        loadImgInfo.writeUInt16LE(x, 14);                     // X coordinate
        loadImgInfo.writeUInt16LE(y, 16);                     // Y coordinate
        loadImgInfo.writeUInt16LE(width, 18);                 // Width

        // Send the load image info
        await this.sendData(Array.from(loadImgInfo));

        // Send image data in chunks
        const chunkSize = 4096;
        const imageData = this.convertTo4bpp(x, y, width, height);

        for (let i = 0; i < imageData.length; i += chunkSize) {
            const chunk = imageData.slice(i, Math.min(i + chunkSize, imageData.length));
            await this.sendData(Array.from(chunk));
        }

        await this.sendCommand(this.commands.LD_IMG_END);
    }

    convertTo4bpp(x, y, width, height) {
        const outputBuffer = Buffer.alloc(Math.ceil((width * height * 4) / 8));
        let outputIndex = 0;

        for (let row = y; row < y + height; row++) {
            for (let col = x; col < x + width; col += 2) {
                // Get two pixels and pack them into one byte
                const pixel1 = this.getPixelValue(col, row);
                const pixel2 = col + 1 < x + width ? this.getPixelValue(col + 1, row) : 0;

                // Pack two 4-bit pixels into one byte (big-endian to little-endian conversion)
                const packedByte = (pixel2 << 4) | pixel1;
                outputBuffer[outputIndex++] = packedByte;
            }
        }

        return outputBuffer;
    }

    getPixelValue(x, y) {
        if (x >= this.width || y >= this.height) return 0;

        // Calculate bit position in buffer
        const pixelIndex = y * this.width + x;
        const byteIndex = Math.floor(pixelIndex / 2);
        const isHighNibble = pixelIndex % 2 === 0;

        if (byteIndex >= this.imageBuffer.length) return 0;

        const byte = this.imageBuffer[byteIndex];
        return isHighNibble ? (byte & 0x0F) : ((byte & 0xF0) >> 4);
    }

    async displayArea(x, y, width, height, mode = 'GC16') {
        const displayMode = typeof mode === 'string' ? this.displayModes[mode] : mode;

        await this.sendCommand(this.commands.DPY_AREA);
        await this.sendData([
            (x >> 8) & 0xFF, x & 0xFF,           // X coordinate
            (y >> 8) & 0xFF, y & 0xFF,           // Y coordinate
            (width >> 8) & 0xFF, width & 0xFF,   // Width
            (height >> 8) & 0xFF, height & 0xFF, // Height
            (displayMode >> 8) & 0xFF, displayMode & 0xFF  // Display mode
        ]);

        await this.waitUntilIdle();
    }

    async displayImage(mode = 'GC16') {
        // Load the full image to display buffer
        await this.loadImageArea(0, 0, this.width, this.height, mode);

        // Display the loaded image
        await this.displayArea(0, 0, this.width, this.height, mode);
    }

    // Set pixel with 4-bit grayscale value (0-15)
    setPixel(x, y, grayLevel) {
        if (x >= this.width || y >= this.height || grayLevel < 0 || grayLevel > 15) {
            return;
        }

        const pixelIndex = y * this.width + x;
        const byteIndex = Math.floor(pixelIndex / 2);
        const isHighNibble = pixelIndex % 2 === 0;

        if (byteIndex >= this.imageBuffer.length) return;

        if (isHighNibble) {
            // Clear high nibble and set new value
            this.imageBuffer[byteIndex] = (this.imageBuffer[byteIndex] & 0xF0) | (grayLevel & 0x0F);
        } else {
            // Clear low nibble and set new value
            this.imageBuffer[byteIndex] = (this.imageBuffer[byteIndex] & 0x0F) | ((grayLevel & 0x0F) << 4);
        }
    }

    // Convenience methods for common grayscale values
    setBlackPixel(x, y) {
        this.setPixel(x, y, 0);
    }

    setWhitePixel(x, y) {
        this.setPixel(x, y, 15);
    }

    setGrayPixel(x, y, level) {
        // Convert 0-255 range to 0-15 range
        const grayLevel = Math.floor((level / 255) * 15);
        this.setPixel(x, y, grayLevel);
    }

    // Fill entire display with a grayscale level
    fill(grayLevel) {
        if (grayLevel < 0 || grayLevel > 15) return;

        const packedValue = (grayLevel << 4) | grayLevel;
        this.imageBuffer.fill(packedValue);
    }

    // Draw a rectangle with specified grayscale level
    drawRect(x, y, width, height, grayLevel, filled = false) {
        if (filled) {
            for (let row = y; row < y + height && row < this.height; row++) {
                for (let col = x; col < x + width && col < this.width; col++) {
                    this.setPixel(col, row, grayLevel);
                }
            }
        } else {
            // Draw outline
            for (let col = x; col < x + width && col < this.width; col++) {
                if (y >= 0 && y < this.height) this.setPixel(col, y, grayLevel);
                if (y + height - 1 >= 0 && y + height - 1 < this.height) {
                    this.setPixel(col, y + height - 1, grayLevel);
                }
            }
            for (let row = y; row < y + height && row < this.height; row++) {
                if (x >= 0 && x < this.width) this.setPixel(x, row, grayLevel);
                if (x + width - 1 >= 0 && x + width - 1 < this.width) {
                    this.setPixel(x + width - 1, row, grayLevel);
                }
            }
        }
    }

    // Create a test pattern showing all 16 grayscale levels
    async showGrayscaleTest() {
        await this.clear();

        const cellWidth = Math.floor(this.width / 4);
        const cellHeight = Math.floor(this.height / 4);

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const grayLevel = row * 4 + col;
                const x = col * cellWidth;
                const y = row * cellHeight;

                this.drawRect(x, y, cellWidth, cellHeight, grayLevel, true);
            }
        }

        await this.display();
    }

    async clear() {
        this.fill(15); // Fill with white
    }

    async display(mode = 'GC16') {
        await this.displayImage(mode);
    }

    // Factory methods for different modes
    static create(options = {}) {
        return new EPD13in3Gray(options);
    }

    static create16Gray(options = {}) {
        return EPD13in3Gray.create(options);
    }
}

module.exports = {
    EPD13in3Gray,
    create16Gray: (options) => EPD13in3Gray.create16Gray(options)
};