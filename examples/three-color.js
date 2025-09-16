const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('2in7b', 'red');

    try {
        await display.init();

        // Draw in three colors: black, white, red
        display.drawRect(10, 10, 50, 50, 0, true);  // Black square
        display.drawRect(70, 10, 50, 50, 1, true);  // White square
        display.drawRect(130, 10, 50, 50, 2, true); // Red/accent square

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();