const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('7in5', 'mono');

    try {
        await display.init();

        // Draw various shapes
        display.drawRect(50, 50, 100, 80, 0);        // Rectangle outline
        display.drawRect(200, 50, 100, 80, 0, true); // Filled rectangle
        display.drawLine(50, 200, 300, 200, 0);      // Horizontal line
        display.drawLine(175, 150, 175, 250, 0);     // Vertical line

        // Draw a simple pattern with individual pixels
        for (let i = 0; i < 50; i++) {
            display.setPixel(400 + i, 100 + (i % 20), 0);
        }

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();