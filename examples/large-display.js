const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('13in3k', 'mono');

    try {
        await display.init();

        // Demonstrate large display capabilities
        const centerX = Math.floor(display.width / 2);
        const centerY = Math.floor(display.height / 2);

        // Draw concentric rectangles
        for (let i = 0; i < 5; i++) {
            const size = 100 + (i * 50);
            const x = centerX - size / 2;
            const y = centerY - size / 2;
            display.drawRect(x, y, size, size, 0);
        }

        // Corner markers
        display.drawRect(10, 10, 50, 50, 0, true);
        display.drawRect(display.width - 60, 10, 50, 50, 0, true);
        display.drawRect(10, display.height - 60, 50, 50, 0, true);
        display.drawRect(display.width - 60, display.height - 60, 50, 50, 0, true);

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();