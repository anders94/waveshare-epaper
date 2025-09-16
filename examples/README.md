# Waveshare E-Paper Examples

This directory contains working examples demonstrating each feature of the waveshare-epaper library. Each example focuses on a specific capability and can be copied directly into your projects.

## Quick Start

All examples use the main module import:

```javascript
const { createDisplay } = require('waveshare-epaper');
```

Run any example with Node.js:
```bash
node examples/monochrome-basic.js
```

## Available Examples

### Basic Display Types

#### [monochrome-basic.js](monochrome-basic.js)
**Display:** 2.13" monochrome (122×250)
**Features:** Basic shapes, lines, and pixels
**Demonstrates:** Fundamental drawing operations on a small monochrome display

Creates a simple pattern with:
- Filled black rectangle
- Diagonal line
- Individual pixel
- Puts display to sleep without clearing

---

#### [grayscale-4level.js](grayscale-4level.js)
**Display:** 2.7" 4-level grayscale (176×264)
**Features:** 4-level grayscale rendering
**Demonstrates:** All four grayscale levels (black, dark gray, light gray, white)

Shows four adjacent rectangles demonstrating each gray level for comparison.

---

#### [grayscale-16level.js](grayscale-16level.js)
**Display:** 13.3" 16-level grayscale (1600×1200)
**Features:** IT8951 controller with 16 grayscale levels
**Demonstrates:** Full grayscale gradient rendering

Creates a gradient bar showing all 16 grayscale levels from black to white.

---

### Color Displays

#### [three-color.js](three-color.js)
**Display:** 2.7" 3-color (176×264)
**Features:** Black, white, and accent color (red or yellow)
**Demonstrates:** 3-color display capabilities

Shows three squares in black, white, and the accent color side by side.

---

#### [seven-color.js](seven-color.js)
**Display:** 7.3" 7-color (800×480)
**Features:** Full 7-color display
**Demonstrates:** All available colors and color name usage

Displays all 7 colors (BLACK, WHITE, GREEN, BLUE, RED, YELLOW, ORANGE) as stacked rectangles.

---

### Drawing Functions

#### [drawing-shapes.js](drawing-shapes.js)
**Display:** 7.5" monochrome (640×384)
**Features:** Shape drawing functions
**Demonstrates:** Lines, rectangles (filled/outline), individual pixels

Creates various shapes:
- Rectangle outline and filled rectangle
- Horizontal and vertical lines
- Pixel pattern demonstration

---

### Image and Canvas Rendering

#### [png-image.js](png-image.js)
**Display:** 2.7" monochrome (176×264)
**Features:** PNG image loading and display
**Demonstrates:** Loading PNG files with automatic color conversion

Attempts to load 'test.png' and display it. If the file doesn't exist, shows a fallback pattern with diagonal lines.

---

#### [canvas-rendering.js](canvas-rendering.js)
**Display:** 7.5" monochrome (640×384)
**Features:** HTML5 Canvas rendering
**Requires:** `npm install canvas`
**Demonstrates:** Dynamic graphics generation using Canvas API

Creates a canvas with:
- Text rendering ("Hello Canvas!")
- Circle drawing
- Canvas to display conversion

---

### Large Display

#### [large-display.js](large-display.js)
**Display:** 13.3" monochrome (960×680)
**Features:** Large format display capabilities
**Demonstrates:** Working with high-resolution displays

Shows the capabilities of large displays with:
- Concentric rectangles at the center
- Corner markers to show full display area utilization
- Demonstrates coordinate system for large displays

---

## Running Examples

### Prerequisites
- Raspberry Pi with SPI enabled
- Appropriate Waveshare e-paper display connected
- Node.js 14+ installed
- GPIO tools: `sudo apt install gpiod`

### GPIO Permissions Setup
For security, add your user to the `gpio` group instead of running as root:

```bash
# Add current user to gpio group (one-time setup)
sudo usermod -a -G gpio $USER

# Log out and back in for changes to take effect
```

### Basic Usage
```bash
# Clone or install the waveshare-epaper package
npm install waveshare-epaper

# Copy any example to your project
cp node_modules/waveshare-epaper/examples/monochrome-basic.js .

# Run normally (after gpio group setup)
node monochrome-basic.js

# Or as fallback if gpio group doesn't work
sudo node monochrome-basic.js
```

### Raspberry Pi 5 Users
Pi 5 uses a different GPIO chip. Add this to your configuration:

```javascript
const display = createDisplay('2in13', 'mono', {
    gpioChip: 'gpiochip4'  // Required for Pi 5
});
```

### Canvas Examples
Canvas examples require the `canvas` package:
```bash
npm install canvas
```

## Customizing Examples

Each example can be easily modified:

1. **Change display model**: Update the first parameter in `createDisplay()`
2. **Change color mode**: Update the second parameter (where supported)
3. **Modify GPIO pins**: Add pin configuration to the options object
4. **Add your graphics**: Insert drawing commands before `display.display()`

### Example Customization
```javascript
const { createDisplay } = require('waveshare-epaper');

async function main() {
    // Change to your display model and color mode
    const display = createDisplay('7in5', 'mono', {
        rstPin: 17,    // Customize GPIO pins if needed
        dcPin: 25,
        busyPin: 24,
        pwrPin: 18
    });

    try {
        await display.init();

        // Add your custom drawing here
        display.drawRect(50, 50, 200, 100, 0, true);
        display.drawLine(0, 0, display.width, display.height, 0);

        await display.display();
        await display.sleep();  // Important: preserves image

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();
```

## Notes

- All examples put the display to sleep after updating, which preserves the image
- Examples include proper error handling and cleanup
- GPIO permissions: add your user to the `gpio` group (recommended) or use `sudo` as fallback
- Each example is self-contained and ready to copy to your projects