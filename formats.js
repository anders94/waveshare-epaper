// Pixel format strategies - one class per color mode.
//
// Each format owns everything that depends on how pixels are packed into the
// framebuffer: bit packing, the clear/background values, and RGB
// quantization. EPDBase delegates to the active format, so drawing code and
// drivers stay format-agnostic and adding a color mode means adding one
// class here instead of editing every method in the base class.
//
// A format operates on `buffers` = { image, color } where `color` is the
// second plane used by 3-color panels (null otherwise).

class MonoFormat {
    constructor() {
        this.bitsPerPixel = 1;
        this.background = 1; // white
    }

    clear(buffers) {
        buffers.image.fill(0xFF); // white
    }

    setPixel(buffers, width, x, y, color) {
        const index = x + y * width;
        const byteIndex = Math.floor(index / 8);
        const bitIndex = 7 - (index % 8);

        if (color === 0) {
            buffers.image[byteIndex] &= ~(1 << bitIndex); // black
        } else {
            buffers.image[byteIndex] |= (1 << bitIndex); // white
        }
    }

    rgbToColor(r, g, b) {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        return gray < 128 ? 0 : 1; // black or white
    }
}

class Gray4Format {
    constructor() {
        this.bitsPerPixel = 2;
        this.background = 3; // white
    }

    clear(buffers) {
        // White = 11 per pixel, 4 pixels per byte = 0xFF
        buffers.image.fill(0xFF);
    }

    setPixel(buffers, width, x, y, color) {
        // Store pixels in the format expected by the C encoding algorithm:
        // 2 bits per pixel, top bits first (shifts 6,4,2,0)
        const index = x + y * width;
        const byteIndex = Math.floor(index / 4);
        const bitShift = 6 - ((index % 4) * 2);

        // 0=black, 1=dark gray, 2=light gray, 3=white
        const rawValue = (color >= 0 && color <= 3) ? color : 3;

        const mask = 0x03 << bitShift;
        buffers.image[byteIndex] &= ~mask;
        buffers.image[byteIndex] |= (rawValue << bitShift);
    }

    rgbToColor(r, g, b) {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        if (gray < 64) return 0;
        else if (gray < 128) return 1;
        else if (gray < 192) return 2;
        else return 3;
    }
}

class ThreeColorFormat {
    constructor() {
        this.bitsPerPixel = 1;
        this.background = 1; // white
        this.usesColorBuffer = true;
    }

    clear(buffers) {
        buffers.image.fill(0xFF); // white background
        if (buffers.color) buffers.color.fill(0x00); // no accent color
    }

    setPixel(buffers, width, x, y, color) {
        // 0 = black, 1 = white, 2 = red/yellow (accent color)
        const index = x + y * width;
        const byteIndex = Math.floor(index / 8);
        const bitIndex = 7 - (index % 8);

        if (color === 2) {
            // Accent color - white in main buffer, set in color buffer
            buffers.image[byteIndex] |= (1 << bitIndex);
            if (buffers.color) {
                buffers.color[byteIndex] |= (1 << bitIndex);
            }
        } else if (color === 0) {
            // Black - clear in both buffers
            buffers.image[byteIndex] &= ~(1 << bitIndex);
            if (buffers.color) {
                buffers.color[byteIndex] &= ~(1 << bitIndex);
            }
        } else {
            // White - set in main buffer, clear in color buffer
            buffers.image[byteIndex] |= (1 << bitIndex);
            if (buffers.color) {
                buffers.color[byteIndex] &= ~(1 << bitIndex);
            }
        }
    }

    rgbToColor(r, g, b) {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        // Check if it's predominantly red or yellow
        if (r > g + 50 && r > b + 50 && r > 150) return 2; // Red-ish
        if (r > 150 && g > 150 && b < 100) return 2; // Yellow-ish

        return gray < 128 ? 0 : 1;
    }
}

class SevenColorFormat {
    constructor(colors) {
        this.bitsPerPixel = 4; // 2 pixels per byte, 3 bits used per pixel
        this.colors = colors;
        this.background = colors.WHITE;
    }

    clear(buffers) {
        buffers.image.fill(0x11); // each nibble = WHITE
    }

    setPixel(buffers, width, x, y, color) {
        const index = x + y * width;
        const byteIndex = Math.floor(index / 2);

        // Clamp to the valid color range
        const validColor = Math.max(0, Math.min(7, color));

        if (index % 2 === 0) {
            // First pixel (upper 4 bits)
            buffers.image[byteIndex] = (buffers.image[byteIndex] & 0x0F) | ((validColor & 0x0F) << 4);
        } else {
            // Second pixel (lower 4 bits)
            buffers.image[byteIndex] = (buffers.image[byteIndex] & 0xF0) | (validColor & 0x0F);
        }
    }

    rgbToColor(r, g, b) {
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
}

// Returns null for modes without a format (e.g. the experimental 16gray
// driver, which overrides the pixel operations itself).
function createFormat(colorMode, colors) {
    switch (colorMode) {
        case 'mono': return new MonoFormat();
        case '4gray': return new Gray4Format();
        case '3color': return new ThreeColorFormat();
        case '7color': return new SevenColorFormat(colors);
        default: return null;
    }
}

module.exports = {
    MonoFormat,
    Gray4Format,
    ThreeColorFormat,
    SevenColorFormat,
    createFormat
};
