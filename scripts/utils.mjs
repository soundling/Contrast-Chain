const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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
}

const convert = {
    base58: {
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
        toUint8Array: (base58) => {
            if (typeValidation.base58(base58) === false) { return false; }
        
            const hex = convert.base58.toHex(base58);
            return convert.hex.toUint8Array(hex);
        },
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
    bigInt: {
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
    },
    number: {
        /** @param {number} num - Integer to convert to base58 */
        toBase58: (num) => {
            return convert.bigInt.toBase58(BigInt(num));
        }
    },
    uint8Array: {
        toBase64: (uint8Array) => {
            if (isNode) {
                return uint8Array.toString('base64');
            }
        
            const binaryString = String.fromCharCode.apply(null, uint8Array);
            return btoa(binaryString);
        },
        toHex: (uint8Array) => {
            return Array.from(uint8Array, function(byte) {
                return ('0' + (byte & 0xFF).toString(16)).slice(-2);
            }).join('');
        },
    },
    base64: {
        toUint8Array: (base64) => {
            if (isNode) {
                /** @type {Uint8Array} */
                bytes = Buffer.from(base64, 'base64');
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
    },
    hex: {
        toBigInt: (hex) => {
            if (hex.length === 0) { console.error('Hex string is empty'); return false; }
    
            return BigInt('0x' + hex);
        },
        toBase58: (hex) => {
            const num = convert.hex.toBigInt(hex);
            return convert.bigInt.toBase58(num);
        },
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
}

const utils = {
    typeValidation,
    convert,
    /*hexToBase58,
    stringToBase58,
    numberToBase58,
    hexToBits,
    uint8ArrayToHex,
    hexToUint8Array,
    uint8ArrayToBase64,
    base64ToUint8Array,*/
};

export default utils;