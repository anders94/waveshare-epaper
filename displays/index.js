const EPD2in13 = require('./EPD2in13');
const EPD2in7 = require('./EPD2in7');
const EPD2in7b = require('./EPD2in7b');
const EPD7in5 = require('./EPD7in5');
const EPD7in3f = require('./EPD7in3f');
const EPD13in3k = require('./EPD13in3k');
const EPD13in3b = require('./EPD13in3b');
const EPD13in3Gray = require('./EPD13in3Gray');

// Each display module exports { meta, create } - the factory lookup and the
// supported-models list are both derived from that, so they cannot drift.
const modules = [
    EPD2in13,
    EPD2in7,
    EPD2in7b,
    EPD7in5,
    EPD7in3f,
    EPD13in3k,
    EPD13in3b,
    EPD13in3Gray
];

const registry = new Map();
for (const mod of modules) {
    for (const name of [mod.meta.model, ...(mod.meta.aliases || [])]) {
        registry.set(name.toLowerCase(), mod);
    }
}

module.exports = {
    EPD2in13,
    EPD2in7,
    EPD2in7b,
    EPD7in5,
    EPD7in3f,
    EPD13in3k,
    EPD13in3b,
    EPD13in3Gray,

    // Convenience function to create display by model name
    createDisplay: (model, colorMode, options = {}) => {
        const mod = registry.get(String(model).toLowerCase());

        if (!mod) {
            const supported = modules.map(m => m.meta.model).join(', ');
            throw new Error(`Unsupported display model: ${model}. Supported models: ${supported}`);
        }

        return mod.create(colorMode, options);
    },

    // List all supported models
    getSupportedModels: () => modules.map(mod => ({ ...mod.meta }))
};
