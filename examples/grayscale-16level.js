const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('13in3gray', '16gray');

    try {
        await display.init();

        // Draw gradient with 16 grayscale levels
        const width = Math.floor(display.width / 16);
        for (let i = 0; i < 16; i++) {
            const x = i * width;
            display.drawRect(x, 100, width, 200, i, true);
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