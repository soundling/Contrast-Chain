'use strict';

import ed25519 from './noble-ed25519-03-2024.mjs';
/**
* @typedef {import("./classes.mjs").Block} Block
* @typedef {import("./classes.mjs").AddressTypeInfo} AddressTypeInfo
* @typedef {import("./classes.mjs").Transaction} Transaction
* @typedef {import("./conCrypto.mjs").argon2Hash} HashFunctions
*/

const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
const cryptoLib = isNode ? crypto : window.crypto;

async function getArgon2Lib() {
    try {
        if (argon2) { return argon2; }
    } catch (error) {
        // console.log('Argon2 not found, importing...');
    }

    if (isNode) {
        const a = await import('argon2');
        a.limits.timeCost.min = 1; // ByPass the minimum time cost
        return a;
    } else {
        const argon2Import = await import('./argon2-ES6.min.mjs');
        const a = argon2Import.default;
        window.argon2 = a;
        return a;
    }
};
const argon2Lib = await getArgon2Lib();

const blockchainSettings = {
    targetBlockTime: 2_000, // 2 sec ||| // 120000, // 2 min
    thresholdPerDiffIncrement: 10, // meaning 10% threshold for 1 diff point
    maxDiffIncrementPerAdjustment: 8, // 8 diff points = 50% of diff
    blocksBeforeAdjustment: 144, // ~5h

    blockReward: 256_000_000,
    minBlockReward: 1_000_000,
    halvingInterval: 52_960, // 1/5 year at 2 min per block
    maxSupply: 27_000_000_000_000, // last 2 zeros are considered as decimals

    minTransactionFeePerByte: 1,
};
/*const blockchainSettings = { // Not used ATM
    targetBlockTime: 600_000, // 10 min
    thresholdPerDiffIncrement: 10, // meaning 10% threshold for 1 diff point
    maxDiffIncrementPerAdjustment: 8, // 8 diff points = 50% of diff
    blocksBeforeAdjustment: 144, // ~24h

    blockReward: 25_600,
    minBlockReward: 100,
    halvingInterval: 52_960, // 1 year at 10 min per block
    maxSupply: 27_000_000_00, // last 2 zeros are considered as decimals
};
};*/

const addressUtils = {
    params: {
        argon2DerivationMemory: 2**16,
        addressDerivationBytes: 16, // the hex return will be double this value
        addressBase58Length: 20,
    },
    glossary: {
        W: { name: 'Weak', description: 'No condition', zeroBits: 0, nbOfSigners: 1 },
        C: { name: 'Contrast', description: '16 times harder to generate', zeroBits: 4, nbOfSigners: 1 },
        S: { name: 'Secure', description: '256 times harder to generate', zeroBits: 8, nbOfSigners: 1 },
        P: { name: 'Powerful', description: '4096 times harder to generate', zeroBits: 12, nbOfSigners: 1 },
        U: { name: 'Ultimate', description: '65536 times harder to generate', zeroBits: 16, nbOfSigners: 1 },
    },

    /**
     * This function uses an Argon2 hash function to perform a hashing operation.
     * @param {HashFunctions} argon2HashFunction
     * @param {string} pubKeyHex
     */
    deriveAddress: async (argon2HashFunction, pubKeyHex) => {
        const hex128 = pubKeyHex.substring(32, 64);
        const salt = pubKeyHex.substring(0, 32); // use first part as salt because entropy is lower

        const argon2hash = await argon2HashFunction(hex128, salt, 1, addressUtils.params.argon2DerivationMemory, 1, 2, addressUtils.params.addressDerivationBytes);
        if (!argon2hash) {
            console.error('Failed to hash the SHA-512 pubKeyHex');
            return false;
        }
        
        const hex = argon2hash.hex;
        const addressBase58 = utils.convert.hex.toBase58(hex).substring(0, 20);
        
        return addressBase58;
    },

    /** ==> First verification, low computation cost.
     * 
     * - Control the length of the address and its first char 
     * @param {string} addressBase58 - Address to validate
     */
    conformityCheck: (addressBase58) => {
        if (typeof addressBase58 !== 'string') { throw new Error('Invalid address type !== string'); }
        if (addressBase58.length !== 20) { throw new Error('Invalid address length !== 20'); }

        const firstChar = addressBase58.substring(0, 1);
        /** @type {AddressTypeInfo} */
        const addressTypeInfo = addressUtils.glossary[firstChar];
        if (addressTypeInfo === undefined) { throw new Error(`Invalid address firstChar: ${firstChar}`); }

        return 'Address conforms to the standard';
    },
    /** ==> Second verification, low computation cost.
     * 
     * ( ALWAYS use conformity check first )
     * @param {string} addressBase58 - Address to validate
     * @param {string} pubKeyHex - Public key to derive the address from
     */
    securityCheck: (addressBase58, pubKeyHex = '') => {
        const firstChar = addressBase58.substring(0, 1);
        /** @type {AddressTypeInfo} */
        const addressTypeInfo = addressUtils.glossary[firstChar];
        if (addressTypeInfo === undefined) { throw new Error(`Invalid address firstChar: ${firstChar}`); }

        const bitsArray = convert.hex.toBits(pubKeyHex);
        if (!bitsArray) { throw new Error('Failed to convert the public key to bits'); }

        const condition = conditionnals.binaryStringStartsWithZeros(bitsArray.join(''), addressTypeInfo.zeroBits);
        if (!condition) { throw new Error(`Address does not meet the security level ${addressTypeInfo.zeroBits} requirements`); }

        return 'Address meets the security level requirements';
    },
    /** ==> Third verification, higher computation cost.
     * 
     * ( ALWAYS use conformity check first )
     * 
     * - This function uses an Argon2 hash function to perform a hashing operation.
     * @param {HashFunctions} argon2HashFunction
     * @param {string} addressBase58 - Address to validate
     * @param {string} pubKeyHex - Public key to derive the address from
     */
    derivationCheck: async (argon2HashFunction, addressBase58, pubKeyHex = '') => {
        const derivedAddressBase58 = await addressUtils.deriveAddress(argon2HashFunction, pubKeyHex);
        if (!derivedAddressBase58) { console.error('Failed to derive the address'); return false; }

        return addressBase58 === derivedAddressBase58;
    },

    formatAddress: (addressBase58, separator = ('.')) => {
        if (typeof addressBase58 !== 'string') { return false; }
        if (typeof separator !== 'string') { return false; }

        // WWRMJagpT6ZK95Mc2cqh => WWRM-Jagp-T6ZK-95Mc-2cqh or WWRM.Jagp.T6ZK.95Mc.2cqh
        const formated = addressBase58.match(/.{1,4}/g).join(separator);
        return formated;
    },
};
const typeValidation = {
    base58(base58) {
		for (let i = 0; i < base58.length; i++) {
			const char = base58[i];
			if (base58Alphabet.indexOf(char) === -1) {
				console.error(`Invalid character: ${char}`);
				return false;
			}
		}
		return base58;
	},
    hex(hex) {
        if (hex.length % 2 !== 0) {
            console.error('Hex string length is not a multiple of 2');
            return false;
        }

        for (let i = 0; i < hex.length; i++) {
            const char = hex[i];
            if (isNaN(parseInt(char, 16))) {
                console.error(`Invalid hex character: ${char}`);
                return false;
            }
        }

        return hex;
    }
};
const convert = {
    base58: {
        /** @param {string} base58 - Base58 string to convert to base64 */
        toBase64: (base58) => {
            const uint8Array = convert.base58.toUint8Array(base58);
            return convert.uint8Array.toBase64(uint8Array);
        },
        /** @param {string} base58 - Base58 string to convert to BigInt */
        toBigInt: (base58) => {
            let num = BigInt(0);
            const base = BigInt(58);
        
            for (let i = 0; i < base58.length; i++) {
                const char = base58[i];
                const index = base58Alphabet.indexOf(char);
                if (index === -1) {
                    throw new Error(`Invalid character: ${char}`);
                }
        
                num = num * base + BigInt(index);
            }
        
            return num;
        },
        /** @param {string} base58 - Base58 string to convert to hex */
        toHex: (base58) => {
            const num = convert.base58.toBigInt(base58);
            return num.toString(16);
        },
        /** @param {string} base58 - Base58 string to convert to Uint8Array */
        toUint8Array: (base58) => {
            if (typeValidation.base58(base58) === false) { return false; }
        
            const hex = convert.base58.toHex(base58);
            return convert.hex.toUint8Array(hex);
        },
        /** @param {string} base58 - Base58 string to convert to hex */
        toHex: (base58) => {
            let num = BigInt(0);
            const base = BigInt(58);
        
            for (let i = 0; i < base58.length; i++) {
                const char = base58[i];
                const index = base58Alphabet.indexOf(char);
                if (index === -1) {
                    throw new Error(`Invalid character: ${char}`);
                }
        
                num = num * base + BigInt(index);
            }
        
            let hex = num.toString(16);
            if (hex.length % 2 !== 0) {
                hex = '0' + hex;
            }

            return hex;
        }
    },
    base64: {
        /** @param {string} base64 - Base64 string to convert to base58 */
        toBase58: (base64) => {
            const uint8Array = convert.base64.toUint8Array(base64);
            return convert.uint8Array.toBase58(uint8Array);
        },
        /** @param {string} base64 - Base64 string to convert to BigInt */
        toBigInt: (base64) => {
            const uint8Array = convert.base64.toUint8Array(base64);
            return convert.uint8Array.toBigInt(uint8Array);
        },
        /** @param {string} base64 - Base64 string to convert to hex */
        toHex: (base64) => {
            const uint8Array = convert.base64.toUint8Array(base64);
            return convert.uint8Array.toHex(uint8Array);
        },
        /** @param {string} base64 - Base64 string to convert to Uint8Array */
        toUint8Array: (base64) => {
            if (isNode) {
                /** @type {Uint8Array} */
                const bytes = Buffer.from(base64, 'base64');
                return bytes;
            }
        
            const binaryString = atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        },
        /** @param {string} base64 - Base64 string to convert to BigInt */
        toBits: (base64) => {
            const uint8Array = convert.base64.toUint8Array(base64);
            return convert.uint8Array.toBits(uint8Array);
        }
    },
    bigInt: {
        /** @param {BigInt} num - BigInt to convert to base58 */
        toBase58: (num) => {
            let base58 = '';
            let n = num;
            while (n > 0) {
                const remainder = n % BigInt(base58Alphabet.length);
                base58 = base58Alphabet.charAt(Number(remainder)) + base58;
                n = n / BigInt(base58Alphabet.length);
            }
        
            const bytes = isNode ? Buffer.from(base58) : new TextEncoder().encode(base58);
        
            for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
                base58 = '1' + base58;
            }
        
            return base58;
        },
        /** @param {BigInt} num - BigInt to convert to base64 */
        toBase64: (num) => {
            const hex = num.toString(16);
            return convert.hex.toBase64(hex);
        },
        /** @param {BigInt} num - BigInt to convert to Uint8Array */
        toUint8Array: (num) => {
            const hex = num.toString(16);
            return convert.hex.toUint8Array(hex);
        },
        /** @param {BigInt} num - BigInt to convert to hex */
        toHex: (num) => {
            return num.toString(16);
        },
        /** @param {BigInt} num - BigInt to convert to bits */
        toBits: (num) => {
            const hex = num.toString(16);
            return convert.hex.toBits(hex);
        },
        /** @param {BigInt} num - BigInt to convert to number */
        toNumber: (num) => {
            return Number(num);
        }
    },
    number: {
        /** @param {number} num - Integer to convert to base58 */
        toBase58: (num) => {
            return convert.bigInt.toBase58(BigInt(num));
        },
        /** @param {number} num - Integer to convert to base64 */
        toBase64: (num) => {
            return convert.bigInt.toBase64(BigInt(num));
        },
        /** @param {number} num - Integer to convert to BigInt */
        toBigInt: (num) => {
            return BigInt(num);
        },
        /** @param {number} num - Integer to convert to readable */
        formatNumberAsCurrency: (num) => {
            // 1_000_000 -> 10,000.00
            /*if (num < 100) { return `0.${num.toString().padStart(2, '0')}`; }
            const num2last2 = num.toString().slice(-2);
            const numRest = num.toString().slice(0, -2);
            const separedNum = numRest.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            return `${separedNum}.${num2last2}`;*/

            // 1_000_000_000 -> 1,000.000000
            if (num < 1_000_000) { return `0.${num.toString().padStart(6, '0')}`; }
            const num2last6 = num.toString().slice(-6);
            const numRest = num.toString().slice(0, -6);
            const separedNum = numRest.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            return `${separedNum}.${num2last6}`;
        },
    },
    uint8Array: {
        /** @param {Uint8Array} uint8Array - Uint8Array to convert to base58 */
        toBase58: (uint8Array) => {
            const hex = convert.uint8Array.toHex(uint8Array);
            return convert.hex.toBase58(hex);
        },
        /** @param {Uint8Array} uint8Array - Uint8Array to convert to base64 */
        toBase64: (uint8Array) => {
            if (isNode) {
                return uint8Array.toString('base64');
            }
        
            const binaryString = String.fromCharCode.apply(null, uint8Array);
            return btoa(binaryString);
        },
        /** @param {Uint8Array} uint8Array - Uint8Array to convert to BigInt */
        toBigInt: (uint8Array) => {
            const hex = convert.uint8Array.toHex(uint8Array);
            return convert.hex.toBigInt(hex);
        },
        /** @param {Uint8Array} uint8Array - Uint8Array to convert to hex */
        toHex: (uint8Array) => {
            return Array.from(uint8Array, function(byte) {
                return ('0' + (byte & 0xFF).toString(16)).slice(-2);
            }).join('');
        },
        /** @param {Uint8Array} uint8Array - Uint8Array to convert to bits */
        toBits: (uint8Array) => {
            const bitsArray = [];
            for (let i = 0; i < uint8Array.length; i++) {
                const bits = uint8Array[i].toString(2).padStart(8, '0');
                bitsArray.push(...bits.split('').map(bit => parseInt(bit, 10)));
            }
        
            return bitsArray;
        }
    },
    hex: {
        /** @param {string} hex - Hex string to convert to Uint8Array */
        toBase58: (hex) => {
            const num = convert.hex.toBigInt(hex);
            return convert.bigInt.toBase58(num);
        },
        /** @param {string} hex - Hex string to convert to base64 */
        toBase64: (hex) => {
            const uint8Array = convert.hex.toUint8Array(hex);
            return convert.uint8Array.toBase64(uint8Array);
        },
        /** @param {string} hex - Hex string to convert to BigInt */
        toBigInt: (hex) => {
            if (hex.length === 0) { console.error('Hex string is empty'); return false; }
    
            return BigInt('0x' + hex);
        },
        /** @param {string} hex - Hex string to convert to Uint8Array */
        toUint8Array: (hex) => {
            if (hex.length % 2 !== 0) {
                throw new Error("The length of the input is not a multiple of 2.");
            }
    
            const length = hex.length / 2;
            const uint8Array = new Uint8Array(length);
            
            for (let i = 0, j = 0; i < length; ++i, j += 2) {
                uint8Array[i] = parseInt(hex.substring(j, j + 2), 16);
            }
    
            return uint8Array;
        },
        /** @param {string} hex - Hex string to convert to bits */
        toBits: (hex = '') => {
            const expectedLength = hex.length / 2 * 8;
            if (hex.length % 2 !== 0) { console.info('The length of the input is not a multiple of 2.'); return false }
    
            let bitsArray = [];
            for (let i = 0; i < hex.length; i++) {
                const bits = parseInt(hex[i], 16).toString(2).padStart(4, '0');
                bitsArray = bitsArray.concat(bits.split(''));
            }
    
            const bitsArrayAsNumbers = bitsArray.map(bit => parseInt(bit, 10));
            if (bitsArrayAsNumbers.length !== expectedLength) {
                console.info('Expected length:', expectedLength, 'Actual length:', bitsArrayAsNumbers.length);
                console.info('Hex:', hex);
                console.info('Bits:', bitsArrayAsNumbers);
                return false;
            }
    
            return bitsArrayAsNumbers;
        },
    },
    string: {
        /** @param {string} str - String to convert to base58 */
        toBase58: (str) => {
            const uint8Array = new TextEncoder().encode(str);
            return convert.uint8Array.toBase58(uint8Array);
        },
        /** @param {string} str - String to convert to base64 */
        toBase64: (str) => {
            const uint8Array = new TextEncoder().encode(str);
            return convert.uint8Array.toBase64(uint8Array);
        },
        /** @param {string} str - String to convert to BigInt */
        toBigInt: (str) => {
            const uint8Array = new TextEncoder().encode(str);
            return convert.uint8Array.toBigInt(uint8Array);
        },
        /** @param {string} str - String to convert to Uint8Array */
        toUint8Array: (str) => {
            return new TextEncoder().encode(str);
        },
        /** @param {string} str - String to convert to hex */
        toHex: (str) => {
            const uint8Array = new TextEncoder().encode(str);
            return convert.uint8Array.toHex(uint8Array);
        },
    },
};
const conditionnals = {
    /**
     * Check if the string starts with a certain amount of zeros
     * @param {string} string 
     * @param {number} zeros
     */
    binaryStringStartsWithZeros: (string, zeros) => {
        if (typeof string !== 'string') { return false; }
        if (typeof zeros !== 'number') { return false; }
        if (zeros < 0) { return false; }

        const target = '0'.repeat(zeros);
        return string.startsWith(target);
    },

    /**
     * Check if the string as binary is superior or equal to the target
     * @param {string} string 
     * @param {number} minValue 
     */
    binaryStringSupOrEqual: (string = '', minValue = 0) => {
        if (typeof string !== 'string') { return false; }
        if (typeof minValue !== 'number') { return false; }
        if (minValue < 0) { return false; }

        const intValue = parseInt(string, 2);
        return intValue >= minValue;
    },
};

const miningParams = {
    argon2: {
        time: 1,
        mem: 2**18,
        parallelism: 1,
        type: 2,
        hashLen: 32,
    },
    minNonceHexLength: 8,
}
const mining = {
    /**
    * @param {Block[]} chain
    * @returns {number} - New difficulty
    */
    difficultyAdjustment: (chain, logs = true) => {
        const lastBlock = chain[chain.length - 1];
        const blockIndex = lastBlock.index;
        const difficulty = lastBlock.difficulty;

        if (typeof difficulty !== 'number') { console.error('Invalid difficulty'); return 1; }
        if (difficulty < 1) { console.error('Invalid difficulty < 1'); return 1; }

        if (typeof blockIndex !== 'number') { console.error('Invalid blockIndex'); return difficulty; }
        if (blockIndex === 0) { return difficulty; }

        const modulus = blockIndex % blockchainSettings.blocksBeforeAdjustment;
        if (modulus !== 0) { return difficulty; }

        const averageBlockTimeMS = mining.getAverageBlockTime(chain);
        const deviation = 1 - (averageBlockTimeMS / blockchainSettings.targetBlockTime);
        const deviationPercentage = deviation * 100; // over zero = too fast / under zero = too slow

        if (logs) {
            console.log(`BlockIndex: ${blockIndex} | Average block time: ${Math.round(averageBlockTimeMS)}ms`);
            console.log(`Deviation: ${deviation.toFixed(4)} | Deviation percentage: ${deviationPercentage.toFixed(2)}%`);
        }

        const diffAdjustment = Math.floor(Math.abs(deviationPercentage) / blockchainSettings.thresholdPerDiffIncrement);
        const capedDiffIncrement = Math.min(diffAdjustment, blockchainSettings.maxDiffIncrementPerAdjustment);
        const diffIncrement = deviation > 0 ? capedDiffIncrement : -capedDiffIncrement;
        const newDifficulty = Math.max(difficulty + diffIncrement, 1); // cap at 1 minimum

        if (logs) {
            const state = diffIncrement === 0 ? 'maintained' : diffIncrement > 0 ? 'increased' : 'decreased';
            console.log(`Difficulty ${state} ${state !== 'maintained' ? "by: " + diffIncrement + " => " : ""}${state === 'maintained' ? 'at' : 'to'}: ${newDifficulty}`);
        }

        return newDifficulty;
    },

    /** @param {Block[]} chain */
    getAverageBlockTime: (chain) => {
        const NbBlocks = Math.min(chain.length, blockchainSettings.blocksBeforeAdjustment);
        const olderBlock = chain[chain.length - NbBlocks];
        const newerBlock = chain[chain.length - 1];
        const sum = newerBlock.timestamp - olderBlock.timestamp

        return sum / (NbBlocks - 1);
    },

    generateRandomNonce: (length = miningParams.minNonceHexLength) => {
        const Uint8 = new Uint8Array(length);
        crypto.getRandomValues(Uint8);
    
        const Hex = Array.from(Uint8).map(b => b.toString(16).padStart(2, '0')).join('');
    
        return { Uint8, Hex };
    },

    /**
     * This function uses an Argon2 hash function to perform a hashing operation.
     * The Argon2 hash function must follow the following signature:
     * - argon2HashFunction(pass, salt, time, mem, parallelism, type, hashLen)
     * 
     *@param {function(string, string, number=, number=, number=, number=, number=): Promise<false | { encoded: string, hash: Uint8Array, hex: string, bitsArray: number[] }>} argon2HashFunction
     *@param {string} blockSignature - Block signature to hash
     *@param {string} nonce - Nonce to hash
    */
    hashBlockSignature: async (argon2HashFunction, blockSignature = '', nonce = '') => {
        const { time, mem, parallelism, type, hashLen } = miningParams.argon2;
        const newBlockHash = await argon2HashFunction(blockSignature, nonce, time, mem, parallelism, type, hashLen);
        if (!newBlockHash) { return false; }
        
        return newBlockHash;
    },

    getDiffAndAdjust: (difficulty = 1) => {
        const zeros = Math.floor(difficulty / 16);
        const adjust = difficulty % 16;
        return { zeros, adjust };
    },

    verifyBlockHashConformToDifficulty: (HashBitsAsString = '', difficulty = 1) => {
        if (typeof HashBitsAsString !== 'string') { throw new Error('Invalid HashBitsAsString'); }
        if (typeof difficulty !== 'number') { throw new Error('Invalid difficulty type'); }

        if (difficulty < 1) { throw new Error('Invalid difficulty < 1'); }
        if (difficulty > HashBitsAsString.length) { throw new Error('Invalid difficulty > HashBitsAsString.length'); }

        const { zeros, adjust } = mining.getDiffAndAdjust(difficulty);
    
        const condition1 = conditionnals.binaryStringStartsWithZeros(HashBitsAsString, zeros);
        if (!condition1) { throw new Error(`unlucky--(condition 1)=> hash does not start with ${zeros} zeros`); }
    
        const next5Bits = HashBitsAsString.substring(zeros, zeros + 5);
        const condition2 = conditionnals.binaryStringSupOrEqual(next5Bits, adjust);
        if (!condition2) { throw new Error(`unlucky--(condition 2)=> hash does not meet the condition: ${next5Bits} >= ${adjust}`); }
    }
};

const utils = {
    ed25519,
    base58Alphabet,
    isNode,
    cryptoLib,
    argon2: argon2Lib,
    blockchainSettings,
    addressUtils,
    typeValidation,
    convert,
    conditionnals,
    mining,
};

export default utils;