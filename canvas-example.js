const { createCanvas, registerFont } = require('canvas');
const EPD13in3k = require('./index.js');

async function main() {
    // Check if a TTF font file path is provided
    const fontPath = process.argv[2];
    if (!fontPath) {
        console.log('Usage: sudo node canvas-example.js <path-to-ttf-font> [x] [y]');
        console.log('Example: sudo node canvas-example.js /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf 100 50');
        return;
    }

    // Get x, y coordinates from command line (default to center-ish)
    const x = parseInt(process.argv[3]) || 100;
    const y = parseInt(process.argv[4]) || 200;

    const epd = new EPD13in3k({
        busNumber: 0,      // SPI bus 0
        deviceNumber: 0,   // SPI device 0 (CE0)
        rstPin: 17,        // GPIO 17 for reset
        dcPin: 25,         // GPIO 25 for data/command
        csPin: 8,          // GPIO 8 for chip select
        busyPin: 24,       // GPIO 24 for busy signal
        pwrPin: 18         // GPIO 18 for power control
    });

    try {
        console.log('Initializing EPD 13.3" display...');
        await epd.init();
        console.log('EPD initialized successfully');

        console.log(`Registering font: ${fontPath}`);
        // Register the TrueType font
        registerFont(fontPath, { family: 'CustomFont' });

        // Create a canvas with some content
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');

        // Set background to white
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set up text styling
        ctx.fillStyle = 'black';
        ctx.font = '48px CustomFont';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw main text
        ctx.fillText('Hello from Node Canvas!', canvas.width / 2, canvas.height / 2 - 60);

        // Draw smaller subtitle with different styling
        ctx.font = '24px CustomFont';
        ctx.fillStyle = '#444';
        ctx.fillText('TrueType font rendering on E-Paper', canvas.width / 2, canvas.height / 2 - 10);

        // Draw some additional elements to showcase canvas capabilities
        ctx.font = '32px CustomFont';
        ctx.fillStyle = 'black';
        const currentDate = new Date().toLocaleDateString();
        const currentTime = new Date().toLocaleTimeString();
        ctx.fillText(`Date: ${currentDate}`, canvas.width / 2, canvas.height / 2 + 40);
        ctx.fillText(`Time: ${currentTime}`, canvas.width / 2, canvas.height / 2 + 80);

        // Draw a simple border
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

        // Add some decorative elements
        ctx.fillStyle = 'gray';
        ctx.beginPath();
        ctx.arc(100, 100, 30, 0, 2 * Math.PI);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(canvas.width - 100, 100, 30, 0, 2 * Math.PI);
        ctx.fill();

        console.log('Clearing display...');
        epd.imageBuffer.fill(0xFF); // Clear to white

        console.log(`Drawing canvas content at position (${x}, ${y})`);
        await epd.drawCanvas(canvas, x, y);

        console.log('Updating display...');
        await epd.display();

        console.log('Putting display to sleep...');
        await epd.sleep();

        console.log('Canvas rendering completed successfully!');

    } catch (error) {
        console.error('Error:', error.message);
        if (error.message.includes('ENOENT')) {
            console.error('Font file not found. Please provide a valid path to a TTF font file.');
            console.error('Common font locations:');
            console.error('  - /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
            console.error('  - /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf');
            console.error('  - /System/Library/Fonts/Arial.ttf (macOS)');
        }
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