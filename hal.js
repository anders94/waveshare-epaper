// Hardware abstraction layer for waveshare-epaper.
//
// Both backends are injectable via the display options, which makes the
// library testable without hardware and portable to other GPIO/SPI stacks:
//
//   createDisplay('13in3k', 'mono', { gpio: myGpio, spi: mySpi })
//
// gpio interface: { write(pin, value), read(pin) -> 0|1, release?() }
// spi interface:  { open(), transfer(buffer), close() }

const { execFile } = require('child_process');

const GPIO_CHIP_PATTERN = /^gpiochip\d+$/;

function validatePin(name, pin) {
    const n = Number(pin);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
        throw new Error(`Invalid GPIO pin for ${name}: ${JSON.stringify(pin)} (expected an integer 0-255)`);
    }
    return n;
}

function validateGpioChip(chip) {
    if (typeof chip !== 'string' || !GPIO_CHIP_PATTERN.test(chip)) {
        throw new Error(`Invalid GPIO chip name: ${JSON.stringify(chip)} (expected e.g. "gpiochip0")`);
    }
    return chip;
}

// GPIO backend that drives libgpiod's gpioset/gpioget CLI tools. Inputs are
// validated and passed as discrete execFile arguments so nothing ever goes
// through a shell.
class CliGpio {
    constructor(chip = 'gpiochip0') {
        this.chip = validateGpioChip(chip);
    }

    write(pin, value) {
        const line = `${validatePin('pin', pin)}=${value ? 1 : 0}`;
        return new Promise((resolve, reject) => {
            execFile('gpioset', [this.chip, line], (error) => {
                if (error) reject(new Error(`Failed to set GPIO ${pin}: ${error.message}`));
                else resolve();
            });
        });
    }

    read(pin) {
        const line = String(validatePin('pin', pin));
        return new Promise((resolve, reject) => {
            execFile('gpioget', [this.chip, line], (error, stdout) => {
                if (error) reject(new Error(`Failed to read GPIO ${pin}: ${error.message}`));
                else resolve(parseInt(stdout.trim(), 10));
            });
        });
    }

    release() {
        // gpioset/gpioget release their lines when each process exits
    }
}

// SPI backend over the spi-device native module. Lazily required so the
// library (and its tests) can load on machines without SPI support when a
// custom spi backend is injected.
class SpiDeviceBackend {
    constructor(busNumber, deviceNumber, spiOptions) {
        this.busNumber = busNumber;
        this.deviceNumber = deviceNumber;
        this.spiOptions = spiOptions;
        this.device = null;
    }

    open() {
        const spi = require('spi-device');
        return new Promise((resolve, reject) => {
            this.device = spi.open(this.busNumber, this.deviceNumber, this.spiOptions, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    transfer(buffer) {
        return new Promise((resolve, reject) => {
            this.device.transfer([{
                sendBuffer: buffer,
                byteLength: buffer.length
            }], (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    close() {
        if (this.device) {
            this.device.closeSync();
            this.device = null;
        }
    }
}

module.exports = {
    CliGpio,
    SpiDeviceBackend,
    validatePin,
    validateGpioChip
};
