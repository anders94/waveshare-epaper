const { createEPD, getSupportedModels } = require('./index');

async function main() {
    console.log('Supported EPD Models:');
    const models = getSupportedModels();
    models.forEach(model => {
        console.log(`  ${model.model}: ${model.size} (${model.colorModes.join(', ')})`);
    });
    console.log('');

    try {
        // Create a 13.3" display in monochrome mode
        console.log('Creating 13.3" EPD in monochrome mode...');
        const epd = createEPD('13in3k', 'mono', {
            rstPin: 17,
            dcPin: 25,
            busyPin: 24,
            pwrPin: 18  // Power pin for proper display initialization
        });

        console.log(`Display: ${epd.width}x${epd.height}, Color mode: ${epd.colorMode}`);

        // Initialize the display
        console.log('Initializing display...');
        await epd.init();

        // Clear the display
        console.log('Clearing display...');
        await epd.clear();

        // Draw some test content
        console.log('Drawing test pattern...');
        epd.drawRect(10, 10, 100, 50, 0, true); // Black filled rectangle
        epd.drawRect(120, 10, 100, 50, 0, false); // Black outline rectangle
        epd.drawLine(10, 80, 220, 80, 0); // Black line

        // Display the buffer
        console.log('Updating display...');
        await epd.display();

        // Sleep the display
        console.log('Putting display to sleep...');
        await epd.sleep();

        console.log('Example completed successfully!');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example with 4-grayscale mode
async function exampleGrayscale() {
    try {
        // Create a 2.7" display in 4-grayscale mode
        console.log('Creating 2.7" EPD in 4-grayscale mode...');
        const epd = createEPD('2in7', '4gray', {
            rstPin: 17,
            dcPin: 25,
            busyPin: 24,
            pwrPin: 18  // Power pin for proper display initialization
        });

        console.log(`Display: ${epd.width}x${epd.height}, Color mode: ${epd.colorMode}`);

        // Initialize and clear
        await epd.init();
        await epd.clear();

        // Draw grayscale test pattern
        epd.drawRect(10, 10, 30, 30, 0, true);   // Black
        epd.drawRect(50, 10, 30, 30, 1, true);   // Dark gray
        epd.drawRect(90, 10, 30, 30, 2, true);   // Light gray
        epd.drawRect(130, 10, 30, 30, 3, true);  // White

        await epd.display();
        await epd.sleep();

        console.log('Grayscale example completed!');

    } catch (error) {
        console.error('Grayscale example error:', error.message);
    }
}

// Example with PNG image loading
async function examplePNG() {
    try {
        const epd = createEPD('13in3k', 'mono', {
            pwrPin: 18  // Power pin for proper display initialization
        });
        await epd.init();
        await epd.clear();

        // Load and draw PNG image (if file exists)
        try {
            await epd.drawPNG('radius-logo-960x680.png', 0, 0);
            console.log('PNG loaded and drawn successfully');
        } catch (pngError) {
            console.log('PNG file not found, skipping PNG example');
        }

        await epd.display();
        await epd.sleep();

    } catch (error) {
        console.error('PNG example error:', error.message);
    }
}

// Run the examples
if (require.main === module) {
    console.log('EPD Examples\n=============');

    main()
        .then(() => console.log('\n--- Monochrome example complete ---'))
        .then(() => exampleGrayscale())
        .then(() => console.log('\n--- Grayscale example complete ---'))
        .then(() => examplePNG())
        .then(() => console.log('\n--- PNG example complete ---'))
        .catch(error => console.error('Example failed:', error.message));
}

module.exports = { main, exampleGrayscale, examplePNG };