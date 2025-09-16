const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('2in13', 'mono');

    try {
        await display.init();

        // Draw a simple pattern
        display.drawRect(10, 10, 50, 30, 0, true); // Filled black rectangle
        display.drawLine(70, 10, 110, 40, 0); // Black diagonal line
        display.setPixel(120, 25, 0); // Single black pixel

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();