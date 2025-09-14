# Waveshare E-Paper Node.js Driver

[![npm version](https://badge.fury.io/js/waveshare-epaper.svg)](https://www.npmjs.com/package/waveshare-epaper)

A modular Node.js driver for Waveshare E-Paper displays that supports multiple display models with different resolutions and color modes.

## Features

- **Modular architecture**: Easy to extend with new display models
- **Multiple display support**: Currently supports 7+ display models with more easily added
- **Color mode support**: Monochrome, grayscale and color modes where supported by hardware
- **Common API**: Unified interface across all display models
- **Hardware abstraction**: Base class handles common SPI/GPIO operations
- **PNG image loading**: Built-in support for loading and displaying PNG images

## Supported Displays

| Model   | Resolution | Color Modes        | Description |
|---------|------------|-------------------|-------------|
| 2in13   | 122 × 250  | Monochrome        | 2.13" black/white |
| 2in7    | 176 × 264  | Mono, 4-grayscale | 2.7" with grayscale support |
| 2in7b   | 176 × 264  | 3-color           | 2.7" black/white/red or yellow |
| 7in5    | 640 × 384  | Monochrome        | 7.5" black/white |
| 7in3f   | 800 × 480  | 7-color           | 7.3" full color (7 colors) |
| 13in3k  | 960 × 680  | Mono, 4-grayscale | 13.3" with grayscale support |
| 13in3b  | 960 × 680  | 3-color           | 13.3" black/white/red or yellow |

## Installation

```bash
npm install waveshare-epaper
```

## Quick Start

```javascript
const { createEPD } = require('waveshare-epaper');

async function example() {
    // Create display instance (13.3" 4-grayscale)
    const epd = createEPD('13in3k', '4gray', {
        rstPin: 17,
        dcPin: 25,
        busyPin: 24
    });

    // Initialize and use
    await epd.init();
    await epd.clear();

    // Draw with different gray levels (0=black, 1=dark gray, 2=light gray, 3=white)
    epd.drawRect(10, 10, 100, 50, 0, true);   // Black filled rectangle
    epd.drawRect(120, 10, 100, 50, 1, true);  // Dark gray rectangle
    epd.drawRect(230, 10, 100, 50, 2, true);  // Light gray rectangle
    epd.drawLine(10, 80, 330, 80, 0);         // Black line

    // Update display
    await epd.display();
    await epd.sleep();
}

example().catch(console.error);
```

## API Reference

### Factory Functions

#### `createEPD(model, colorMode, options)`
Creates a display instance for the specified model.

- `model` (string): Display model ('2in13', '2in7', '2in7b', '7in5', '7in3f', '13in3k', '13in3b')
- `colorMode` (string): Color mode ('mono', '4gray', '3color', '7color') - must be supported by the display
- `options` (object): Configuration options

**Options:**
- `rstPin` (number): Reset GPIO pin (default: 17)
- `dcPin` (number): Data/Command GPIO pin (default: 25)
- `busyPin` (number): Busy GPIO pin (default: 24)
- `csPin` (number): Chip Select GPIO pin (default: 8)
- `gpioChip` (string): GPIO chip name (default: 'gpiochip0')
- `busNumber` (number): SPI bus number (default: 0)
- `deviceNumber` (number): SPI device number (default: 0)
- `maxSpeedHz` (number): SPI max speed (default: 4000000)
- `accentColor` (string): For 3-color displays, specify 'red' or 'yellow' accent color

#### `getSupportedModels()`
Returns array of supported models with their specifications.

### Display Methods

#### Basic Operations
- `await epd.init()` - Initialize the display
- `await epd.clear()` - Clear display to background color
- `await epd.display()` - Update the display with current buffer
- `await epd.sleep()` - Put display into low power mode
- `await epd.cleanup()` - Clean up resources

#### Drawing Functions
- `epd.setPixel(x, y, color)` - Set individual pixel
- `epd.drawLine(x0, y0, x1, y1, color)` - Draw line
- `epd.drawRect(x, y, width, height, color, filled)` - Draw rectangle
- `await epd.drawPNG(filePath, x, y)` - Load and draw PNG image

#### Enhanced Drawing (Color Displays)
**7-color displays:**
- `epd.setPixelColor(x, y, colorName)` - Set pixel using color name
- `epd.drawColorLine(x0, y0, x1, y1, colorName)` - Draw colored line
- `epd.drawColorRect(x, y, w, h, colorName, filled)` - Draw colored rectangle
- `await epd.show7Block()` - Display all 7 colors in blocks

**3-color displays:**
- `epd.drawBlackRect(x, y, w, h, filled)` - Draw black rectangle
- `epd.drawRedRect(x, y, w, h, filled)` - Draw accent color rectangle
- `await epd.show3ColorTest()` - Display 3-color test pattern

#### Color Values
- **Monochrome mode**: `0` = black, `1` = white
- **4-grayscale mode**: `0` = black, `1` = dark gray, `2` = light gray, `3` = white
- **3-color mode**: `0` = black, `1` = white, `2` = accent color (red or yellow, configurable)
- **7-color mode**: `0` = black, `1` = white, `2` = green, `3` = blue, `4` = red, `5` = yellow, `6` = orange

#### Color Names (7-color displays)
For 7-color displays, you can use color names:
```javascript
epd.setPixelColor(x, y, 'RED');
epd.drawColorRect(10, 10, 100, 50, 'BLUE', true);
epd.drawColorLine(0, 0, 100, 100, 'GREEN');
```
Available colors: `BLACK`, `WHITE`, `RED`, `GREEN`, `BLUE`, `YELLOW`, `ORANGE`

## Architecture

### File Structure
```
├── index.js              # Main entry point and factory functions
├── EPDBase.js             # Base class with common functionality
├── displays/
│   ├── index.js           # Display module exports
│   ├── EPD2in13.js        # 2.13" monochrome display driver
│   ├── EPD2in7.js         # 2.7" mono/4-grayscale display driver
│   ├── EPD2in7b.js        # 2.7" 3-color display driver
│   ├── EPD7in5.js         # 7.5" monochrome display driver
│   ├── EPD7in3f.js        # 7.3" 7-color display driver
│   ├── EPD13in3k.js       # 13.3" mono/4-grayscale display driver
│   └── EPD13in3b.js       # 13.3" 3-color display driver
├── example.js             # Basic usage examples
├── examples-enhanced.js   # Enhanced examples with color displays
└── README.md              # This file
```

### Extending with New Displays

To add support for a new display model:

1. Create a new file in `displays/` (e.g., `EPDNewModel.js`)
2. Extend `EPDBase` class:
   ```javascript
   const EPDBase = require('../EPDBase');

   class EPDNewModel extends EPDBase {
       constructor(options = {}) {
           super(options);
           this.width = 200;    // Set display width
           this.height = 200;   // Set display height
           this.colorMode = options.colorMode || 'mono';
           this.bitsPerPixel = this.colorMode === '4gray' ? 2 : 1;
           this.initializeBuffer();
       }

       async initDisplay() {
           // Implement display-specific initialization
       }

       async displayImage() {
           // Implement display-specific image update
       }
   }
   ```

3. Add to `displays/index.js` exports
4. Add case to `createDisplay()` function

## Hardware Requirements

- Raspberry Pi (tested on RPi5) with SPI enabled
- GPIO pins for RST, DC, CS, and BUSY signals
- `gpiod` tools installed (`apt install gpiod`)

## Examples

### Basic Examples
See `example.js` for basic usage examples including:
- Basic monochrome display usage
- 4-grayscale mode with different gray levels
- PNG image loading and display

### Enhanced Examples
See `examples-enhanced.js` for advanced color examples:

#### 7-Color Display Example
```javascript
const epd = createEPD('7in3f', '7color');
await epd.init();

// Show all 7 colors in blocks
await epd.show7Block();

// Draw using color names
epd.drawColorRect(50, 50, 100, 80, 'RED', true);
epd.drawColorLine(0, 100, 800, 100, 'BLUE');
epd.setPixelColor(10, 10, 'GREEN');

await epd.display();
```

#### 3-Color Display Example
```javascript
// Black/White/Red display
const epd = createEPD('13in3b', 'red');
// Or Black/White/Yellow display
const epd = createEPD('13in3b', 'yellow');

await epd.init();

// Draw in different colors
epd.drawBlackRect(50, 50, 200, 100, true);  // Black rectangle
epd.drawRedRect(300, 50, 200, 100, true);   // Accent color rectangle
// White is the background color

// Show test pattern
await epd.show3ColorTest();
```

#### Advanced Color Detection
The driver automatically converts PNG images to the appropriate color format:
```javascript
// 7-color display will convert RGB to nearest of 7 colors
await epd.drawPNG('colorful-image.png', 0, 0);

// 3-color display will detect red/yellow regions and convert others to black/white
await epd.drawPNG('mixed-color-image.png', 0, 0);
```

## Migration from Original Code

The original `EPD13in3k` class is still available for backward compatibility:

```javascript
const { EPD13in3k } = require('waveshare-epaper');
const epd = new EPD13in3k();
```

However, using the new factory function is recommended:

```javascript
const { createEPD } = require('waveshare-epaper');
const epd = createEPD('13in3k', 'mono');
```

## Publishing

To publish a new version to npm:

```bash
npm version patch  # or minor/major
npm publish
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

Based on Waveshare example code.