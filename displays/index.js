const EPD2in13 = require('./EPD2in13');
const EPD2in7 = require('./EPD2in7');
const EPD2in7b = require('./EPD2in7b');
const EPD7in5 = require('./EPD7in5');
const EPD7in3f = require('./EPD7in3f');
const EPD13in3k = require('./EPD13in3k');
const EPD13in3b = require('./EPD13in3b');

module.exports = {
    EPD2in13,
    EPD2in7,
    EPD2in7b,
    EPD7in5,
    EPD7in3f,
    EPD13in3k,
    EPD13in3b,

    // Convenience function to create display by model name
    createDisplay: (model, colorMode, options = {}) => {
        const modelName = model.toLowerCase();

        switch (modelName) {
            case '2in13':
            case '2.13':
                return EPD2in13.createMono(options);

            case '2in7':
            case '2.7':
                if (colorMode === '4gray') {
                    return EPD2in7.create4Gray(options);
                } else {
                    return EPD2in7.createMono(options);
                }

            case '2in7b':
            case '2.7b':
                return EPD2in7b.create3Color(colorMode || 'red', options);

            case '7in5':
            case '7.5':
                return EPD7in5.createMono(options);

            case '7in3f':
            case '7.3f':
                return EPD7in3f.create7Color(options);

            case '13in3k':
            case '13.3k':
                if (colorMode === '4gray') {
                    return EPD13in3k.create4Gray(options);
                } else {
                    return EPD13in3k.createMono(options);
                }

            case '13in3b':
            case '13.3b':
                return EPD13in3b.create3Color(colorMode || 'red', options);

            default:
                throw new Error(`Unsupported display model: ${model}. Supported models: 2in13, 2in7, 2in7b, 7in5, 7in3f, 13in3k, 13in3b`);
        }
    },

    // List all supported models
    getSupportedModels: () => {
        return [
            { model: '2in13', size: '122x250', colorModes: ['mono'], description: '2.13" monochrome' },
            { model: '2in7', size: '176x264', colorModes: ['mono', '4gray'], description: '2.7" mono/4-grayscale' },
            { model: '2in7b', size: '176x264', colorModes: ['3color'], description: '2.7" black/white/red' },
            { model: '7in5', size: '640x384', colorModes: ['mono'], description: '7.5" monochrome' },
            { model: '7in3f', size: '800x480', colorModes: ['7color'], description: '7.3" full color (7 colors)' },
            { model: '13in3k', size: '960x680', colorModes: ['mono', '4gray'], description: '13.3" mono/4-grayscale' },
            { model: '13in3b', size: '960x680', colorModes: ['3color'], description: '13.3" black/white/red' }
        ];
    }
};