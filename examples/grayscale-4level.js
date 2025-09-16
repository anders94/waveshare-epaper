const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('2in7', '4gray');

    try {
        await display.init();

        // Draw 4 grayscale levels
        display.drawRect(10, 10, 40, 60, 0, true);   // Black
        display.drawRect(60, 10, 40, 60, 1, true);   // Dark gray
        display.drawRect(110, 10, 40, 60, 2, true);  // Light gray
        display.drawRect(160, 10, 40, 60, 3, true);  // White

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();