import conCrypto from './conCrypto.mjs';

class Wallet {
    constructor(privKeyHex, pubKeyHex) {
        this.initialized = false;
        /** @type {string} */
        this.privKeyHex = privKeyHex;
        /** @type {string} */
        this.pubKeyHex = pubKeyHex;
        /** @type {string[]} */
        this.addresses = [];

        this.UTXOs = [];
    }

    static async restore(mnemonicStr = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about") {
        const argon2HashResult = await conCrypto.argon2Hash(mnemonicStr, "Contrast's Salt Isnt Pepper But It Is Tasty", 27, 1024);
        if (!argon2HashResult) { return false; }

        const keyPair = await conCrypto.generateKeyPairFromHash(argon2HashResult.hex);
        if (!keyPair) { return false; }

        return new Wallet(keyPair.privKeyHex, keyPair.pubKeyHex);
    }
    async deriveAddresses(nbOfAddresses = 10) {
        const nbOfExistingAddresses = this.addresses.length;
        const pubKeyHex = this.pubKeyHex;
        for (let i = nbOfExistingAddresses; i < nbOfAddresses; i++) {

            const address = await conCrypto.deriveAddress(i, pubKeyHex);
            if (!address) { return false; }

            this.addresses.push(address);
        }

        return this.addresses;
    }
}

export default Wallet;