// Generic EPD driver for Waveshare E-Paper displays
// Supports multiple display models with different resolutions and color modes

const Displays = require('./displays');

/**
 * Create an EPD display instance
 * @param {string} model - Display model (e.g., '13in3k', '2in7', '7in5', '2in13')
 * @param {string} colorMode - Color mode ('mono', '4gray') - depends on display capability
 * @param {object} options - Configuration options (GPIO pins, SPI settings, etc.)
 * @returns {EPDBase} Display instance
 */
function createEPD(model, colorMode = 'mono', options = {}) {
    return Displays.createDisplay(model, colorMode, options);
}

/**
 * Get list of supported display models
 * @returns {Array} Array of supported models with their specifications
 */
function getSupportedModels() {
    return Displays.getSupportedModels();
}

module.exports = {
    createEPD,
    getSupportedModels,
    Displays,

    // Backward compatibility - export the original 13in3k class
    EPD13in3k: Displays.EPD13in3k.EPD13in3k
};
