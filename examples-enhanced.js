const { createEPD, getSupportedModels } = require('./index');

async function showSupportedDisplays() {
    console.log('Enhanced EPD Examples');
    console.log('====================\n');

    console.log('Supported Models:');
    const models = getSupportedModels();
    models.forEach(model => {
        console.log(`  ${model.model}: ${model.size} - ${model.colorModes.join(', ')} - ${model.description}`);
    });
    console.log('');
}

// Example with 7-color display
async function example7Color() {
    console.log('=== 7-Color Display Example ===');

    try {
        // Create 7.3" 7-color display
        const epd = createEPD('7in3f', '7color', {
            rstPin: 17,
            dcPin: 25,
            busyPin: 24
        });

        console.log(`Display: ${epd.width}x${epd.height}, Colors: 7-color mode`);

        // Initialize display
        console.log('Initializing 7-color display...');
        await epd.init();

        console.log('Clearing display...');
        await epd.clear();

        console.log('Drawing 7-color test pattern...');

        // Show all 7 colors in blocks
        console.log('Drawing color blocks...');
        await epd.show7Block();

        console.log('Waiting 3 seconds...');
        await epd.delay(3000);

        // Draw mixed color graphics
        console.log('Drawing mixed graphics...');
        await epd.clear();

        // Draw rectangles in different colors
        epd.drawColorRect(50, 50, 100, 80, 'RED', true);
        epd.drawColorRect(200, 50, 100, 80, 'GREEN', true);
        epd.drawColorRect(350, 50, 100, 80, 'BLUE', true);
        epd.drawColorRect(500, 50, 100, 80, 'YELLOW', true);

        // Draw lines in different colors
        epd.drawColorLine(50, 200, 750, 200, 'ORANGE');
        epd.drawColorLine(50, 220, 750, 220, 'RED');
        epd.drawColorLine(50, 240, 750, 240, 'GREEN');

        // Draw outlines
        epd.drawColorRect(100, 300, 200, 100, 'BLACK', false);
        epd.drawColorRect(120, 320, 160, 60, 'WHITE', false);

        await epd.display();

        console.log('Putting display to sleep...');
        await epd.sleep();

        console.log('7-color example completed successfully!\n');

    } catch (error) {
        console.error('7-color example error:', error.message);
    }
}

// Example with 3-color display
async function example3Color() {
    console.log('=== 3-Color Display Example ===');

    try {
        // Create 13.3" 3-color display (black/white/red)
        const epd = createEPD('13in3b', 'red', {
            rstPin: 17,
            dcPin: 25,
            busyPin: 24
        });

        console.log(`Display: ${epd.width}x${epd.height}, Colors: 3-color (black/white/red)`);

        console.log('Initializing 3-color display...');
        await epd.init();

        console.log('Showing 3-color test pattern...');
        await epd.show3ColorTest();

        console.log('Waiting 3 seconds...');
        await epd.delay(3000);

        console.log('Drawing custom 3-color graphics...');
        await epd.clear();

        // Draw content in all three colors
        epd.drawBlackRect(50, 50, 200, 100, true);
        epd.drawRedRect(300, 50, 200, 100, true);

        // White rectangle (background color - draw black outline to show it)
        epd.drawRect(550, 50, 200, 100, 0, false); // Black outline for white area

        // Mixed color graphics
        epd.drawBlackLine(50, 200, 850, 200);
        epd.drawRedLine(50, 220, 850, 220);

        // Text-like patterns (simple blocks representing text)
        epd.drawBlackRect(50, 300, 20, 80, true);  // "I" in black
        epd.drawBlackRect(80, 300, 60, 20, true);  // Top of "L"
        epd.drawBlackRect(80, 360, 60, 20, true);  // Bottom of "L"
        epd.drawBlackRect(80, 300, 20, 80, true);  // Vertical of "L"

        epd.drawRedRect(200, 300, 20, 80, true);   // "I" in red
        epd.drawRedRect(230, 300, 60, 20, true);   // Top of "L"
        epd.drawRedRect(230, 360, 60, 20, true);   // Bottom of "L"
        epd.drawRedRect(230, 300, 20, 80, true);   // Vertical of "L"

        await epd.display();

        console.log('Putting display to sleep...');
        await epd.sleep();

        console.log('3-color example completed successfully!\n');

    } catch (error) {
        console.error('3-color example error:', error.message);
    }
}

// Example with PNG image in color modes
async function exampleColorPNG() {
    console.log('=== Color PNG Example ===');

    try {
        // Try 7-color display first
        const epd = createEPD('7in3f', '7color');

        console.log(`Loading PNG with 7-color conversion: ${epd.width}x${epd.height}`);

        await epd.init();
        await epd.clear();

        // Try to load the PNG image
        try {
            await epd.drawPNG('radius-logo-960x680.png', 0, 0);
            console.log('PNG loaded and converted to 7-color format');
        } catch (pngError) {
            console.log('PNG file not found or error:', pngError.message);
            console.log('Drawing color pattern instead...');

            // Draw a color pattern instead
            for (let i = 0; i < 7; i++) {
                const color = Object.values(epd.colors)[i];
                const startY = Math.floor((epd.height / 7) * i);
                const height = Math.floor(epd.height / 7);

                epd.drawRect(0, startY, epd.width, height, color, true);
            }
        }

        await epd.display();
        await epd.sleep();

        console.log('Color PNG example completed!\n');

    } catch (error) {
        console.error('Color PNG example error:', error.message);
    }
}

// Example showing color name usage
async function exampleColorNames() {
    console.log('=== Color Names Example ===');

    try {
        const epd = createEPD('7in3f', '7color');

        await epd.init();
        await epd.clear();

        console.log('Drawing using color names...');

        const colorNames = ['BLACK', 'WHITE', 'RED', 'GREEN', 'BLUE', 'YELLOW', 'ORANGE'];
        const blockWidth = Math.floor(epd.width / colorNames.length);

        colorNames.forEach((colorName, index) => {
            const x = index * blockWidth;
            console.log(`Drawing ${colorName} block at x=${x}`);

            // Use setPixelColor method
            for (let px = 0; px < blockWidth && x + px < epd.width; px++) {
                for (let py = 0; py < 100; py++) {
                    epd.setPixelColor(x + px, py, colorName);
                }
            }
        });

        await epd.display();
        await epd.sleep();

        console.log('Color names example completed!\n');

    } catch (error) {
        console.error('Color names example error:', error.message);
    }
}

// Main execution
async function runAllExamples() {
    await showSupportedDisplays();

    console.log('Choose which examples to run:');
    console.log('1. 7-Color Display Example');
    console.log('2. 3-Color Display Example');
    console.log('3. Color PNG Example');
    console.log('4. Color Names Example');
    console.log('5. All Examples\n');

    // For demo purposes, we'll run a simple version of each
    console.log('Running simplified examples (no hardware required):\n');

    try {
        // Show display creation without hardware initialization
        console.log('=== Display Creation Test ===');

        const displays = [
            { name: '7in3f', colorMode: '7color' },
            { name: '13in3b', colorMode: 'red' },
            { name: '2in7b', colorMode: 'red' }
        ];

        displays.forEach(({ name, colorMode }) => {
            const epd = createEPD(name, colorMode);
            console.log(`✓ Created ${name} (${colorMode}): ${epd.width}x${epd.height}, mode: ${epd.colorMode}`);

            // Test drawing functions
            epd.setPixel(10, 10, 1);
            if (epd.setPixelColor) {
                epd.setPixelColor(20, 20, 'RED');
            }
            console.log(`  - Buffer size: ${epd.imageBuffer.length} bytes`);
            if (epd.colorBuffer) {
                console.log(`  - Color buffer size: ${epd.colorBuffer.length} bytes`);
            }
            console.log(`  - Available colors: ${Object.keys(epd.colors).join(', ')}`);
        });

        console.log('\n✓ All enhanced display types created successfully!');
        console.log('\nTo run with real hardware, uncomment the hardware examples above.');

    } catch (error) {
        console.error('Display creation test failed:', error.message);
    }
}

// Export for use as module
module.exports = {
    showSupportedDisplays,
    example7Color,
    example3Color,
    exampleColorPNG,
    exampleColorNames,
    runAllExamples
};

// Run examples if called directly
if (require.main === module) {
    runAllExamples().catch(console.error);
}