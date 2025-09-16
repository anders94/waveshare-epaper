const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('7in3f', '7color');

    try {
        await display.init();

        // Draw all 7 colors
        const colors = ['BLACK', 'WHITE', 'GREEN', 'BLUE', 'RED', 'YELLOW', 'ORANGE'];
        const x = 50;
        let y = 50;

        colors.forEach(color => {
            display.drawRect(x, y, 80, 40, display.colors[color], true);
            y += 50;
        });

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();