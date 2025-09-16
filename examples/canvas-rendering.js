const { createCanvas } = require('canvas');
const { createDisplay } = require('waveshare-epaper');

async function main() {
    const display = createDisplay('7in5', 'mono');

    try {
        await display.init();

        // Create a canvas and draw on it
        const canvas = createCanvas(200, 150);
        const ctx = canvas.getContext('2d');

        // Draw on canvas
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 200, 150);

        ctx.fillStyle = 'black';
        ctx.font = '20px Arial';
        ctx.fillText('Hello Canvas!', 10, 30);

        ctx.beginPath();
        ctx.arc(100, 80, 30, 0, 2 * Math.PI);
        ctx.stroke();

        // Render canvas to display
        await display.drawCanvas(canvas, 50, 50);

        await display.display();
        await display.sleep();

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await display.cleanup();
    }
}

main();