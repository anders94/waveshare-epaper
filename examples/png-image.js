const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('2in7', 'mono');

    try {
        await display.init();

        // Load and draw a PNG image
        // Note: You'll need to provide a PNG file in the project directory
        // This example assumes 'test.png' exists
        try {
            await display.drawPNG('test.png', 10, 10);
        } catch (err) {
            console.log('PNG file not found, drawing fallback pattern');
            // Fallback if PNG doesn't exist
            display.drawRect(10, 10, 100, 100, 0);
            display.drawLine(10, 10, 110, 110, 1);
            display.drawLine(110, 10, 10, 110, 1);
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