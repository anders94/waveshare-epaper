const EPD13in3k = require('./index.js');

async function main() {
    const epd = new EPD13in3k({
        busNumber: 0,      // SPI bus 0
        deviceNumber: 0,   // SPI device 0 (CE0)
        rstPin: 17,        // GPIO 17 for reset
        dcPin: 25,         // GPIO 25 for data/command
        csPin: 22,         // GPIO 22 for chip select
        busyPin: 24,       // GPIO 24 for busy signal
        pwrPin: 18         // GPIO 18 for power control
    });

    try {
        console.log('Initializing EPD 13.3" display...');
        await epd.init();
        console.log('EPD initialized successfully');

        // Check if PNG file is provided as command line argument
        const pngFile = process.argv[2];
        if (!pngFile) {
            console.log('Usage: sudo node png-example.js <path-to-png-file> [x] [y]');
            console.log('Example: sudo node png-example.js image.png 100 50');
            return;
        }

        // Get x, y coordinates from command line (default to 0, 0)
        const x = parseInt(process.argv[3]) || 0;
        const y = parseInt(process.argv[4]) || 0;

        console.log('Clearing display...');
        epd.imageBuffer.fill(0xFF); // Clear to white

        console.log(`Loading PNG file: ${pngFile}`);
        await epd.drawPNG(pngFile, x, y);

        console.log('Updating display...');
        await epd.display();

        console.log('Putting display to sleep...');
        await epd.sleep();

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await epd.cleanup();
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    process.exit(0);
});

main().catch(console.error);
