'use strict';
import ed25519 from './noble-ed25519-03-2024.mjs';
import utils from './utils.mjs';

const argon2_POW_Params = {
    time: 1,
    mem: 2**18,
    parallelism: 1,
    type: 2,
    hashLen: 32,
};

//#region - Argon2 Standardization functions
function createArgon2Params(pass = "averylongpassword123456", salt = "saltsaltsaltsaltsalt", time = 1, mem = 2**10, parallelism = 1, type = 2, hashLen = 32) {
    return {
        pass,
        time,
        timeCost: time,
        mem,
        memoryCost: mem,
        hashLen,
        hashLength: hashLen,
        parallelism,
        type,
        salt: utils.isNode ? Buffer.from(salt) : salt,
    };
}
function standardizeArgon2FromEncoded(encoded = '$argon2id$v=19$m=1048576,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$UamPN/XTTX4quPewQNw4/s3y1JJeS22cRroh5l7OTMM') {
    const splited = encoded.split('$');
    const base64 = splited.pop();
    const hash = utils.convert.base64.toUint8Array(base64);
    const hex = utils.convert.uint8Array.toHex(hash);
    const bitsArray = utils.convert.hex.toBits(hex);
    if (!bitsArray) { return false; }

    return { encoded, hash, hex, bitsArray };
}
//#endregion ----------------------

//#region -  Hash functions
/**
 * This function hashes a password using Argon2
 * @param {string} pass - Password to hash
 * @param {string} salt - Salt to use for the hash
 * @param {number} time - Time cost in iterations
 * @param {number} mem - Memory usage in KiB
 * @param {number} parallelism - Number of threads to use
 * @param {number} type - 0: Argon2d, 1: Argon2i, 2: Argon2id
 * @param {number} hashLen - Length of the hash in bytes
 */
async function argon2Hash(pass, salt, time = 1, mem = 2**10, parallelism = 1, type = 2, hashLen = 32) {
    const params = createArgon2Params(pass, salt, time, mem, parallelism, type, hashLen);
    const hashResult = utils.isNode ? await utils.argon2.hash(pass, params) : await utils.argon2.hash(params);
    //const hashResult = utils.isNode ? await utils.argon2.hash(pass, params) : await window.argon2.hash(params);
    if (!hashResult) { return false; }

    const encoded = hashResult.encoded ? hashResult.encoded : hashResult;
    const result = standardizeArgon2FromEncoded(encoded);
    if (!result) { return false; }

    return result;
}
async function SHA256Hash(message) {
    try {
        const messageUint8 = utils.convert.string.toUint8Array(message);
        const arrayBuffer = await utils.cryptoLib.subtle.digest('SHA-256', messageUint8);
        const uint8Array = new Uint8Array(arrayBuffer);
        const hashHex = utils.convert.uint8Array.toHex(uint8Array);
        return hashHex;
    } catch (error) {
        console.error(error);
    }

    return false;
}
//#endregion ----------------------

//#region - Asymetric crypto functions
/** @param {string} privKeyHex - Hexadecimal representation of the private key */
async function generateKeyPairFromHash(privKeyHex) {
    if (privKeyHex.length !== 64) { console.error('Hash must be 32 bytes long (hex: 64 chars)'); return false; }
    
    // Calculer la clé publique à partir de la clé privée
    const publicKey = await ed25519.getPublicKeyAsync(privKeyHex);
    const pubKeyHex = utils.convert.uint8Array.toHex(publicKey);
  
    return { privKeyHex, pubKeyHex };
}
/** 
 * @param {string} messageHex - Message to sign
 * @param {string} privKeyHex - Hexadecimal representation of the private key
 * @param {string} pubKeyHex - Hexadecimal representation of the public key
 */
async function signMessage(messageHex, privKeyHex, pubKeyHex) {
    const result = { isValid: false, signature: '', error: '' };
    if (privKeyHex.length !== 64) { result.error = 'Hash must be 32 bytes long (hex: 64 chars)'; return result; }
    
    const signature = await ed25519.signAsync(messageHex, privKeyHex);
    if (!signature) { result.error = 'Failed to sign the message'; return result; }

    const isValidSignature = await verifySignature(signature, messageHex, pubKeyHex);
    if (!isValidSignature) { result.error = 'Failed to verify the signature'; return result; }

    result.signature = signature;
    return result;
}
/**
 * @param {string} signature 
 * @param {string} messageHex 
 * @param {string} pubKeyHex
 */
async function verifySignature(signature, messageHex, pubKeyHex) {
    /** @type {boolean} */
    const isValid = await ed25519.verifyAsync(signature, messageHex, pubKeyHex);
    return isValid;
}
//#endregion ----------------------

//#region - Address functions
/**
* @param {number} addressIndex - Index of the address to derive
* @param {string} pubKeyHex - Public key to derive the address from
*/
async function deriveAddress(pubKeyHex) {
    //const startTimestamp = Date.now();
    const hex128 = pubKeyHex.substring(0, 32);
    const salt = pubKeyHex.substring(32, 64);

    const argon2hash = await argon2Hash(hex128, salt, 1, 2**12, 1, 2, 16);
    if (!argon2hash) {
        console.error('Failed to hash the SHA-512 address');
        return false;
    }
    
    const hex = argon2hash.hex;
    const addressBase58 = utils.convert.hex.toBase58(hex).substring(0, 20);
    
    //const endTimestamp = Date.now();
    //const duration = endTimestamp - startTimestamp;
    return addressBase58;
}
const addressVerif = {
    /** ==> First verification, low computation cost.
     * @param {string} addressBase58 - Address to validate
     * @param {string} pubKeyHex - Public key that need to pass the conformity tests
     */
    conformityCheck: (addressBase58) => {
        const formatResult = (isConform = false, message = '', error = false, securityLevel = 0, firstChar = '') => {
            return { isConform, message, error, securityLevel, firstChar };
        };
    
        if (typeof addressBase58 !== 'string') { return formatResult(false, 'Invalid address type !== string', true); }
        if (addressBase58.length !== 20) { return formatResult(false, 'Invalid address length !== 20', true); }
    
        const firstChar = addressBase58.substring(0, 1);
        const securityLevel = utils.addressSecurityLevelByPrefix[firstChar];
        if (securityLevel === undefined) { return formatResult(false, `Invalid address firstChar: ${firstChar}`, false); }
    
        return formatResult(true, 'Valid address', false, securityLevel, firstChar);
    },
    /** ==> Second verification, low computation cost. (ALWAYS use conformity check first)
     * @param {string} addressBase58 - Address to validate
     * @param {string} pubKeyHex - Public key to derive the address from
     */
    securityCheck: (addressBase58, pubKeyHex = '') => {
        const formatResult = (isConformToSecurityLevel = false, message = '', error = false, securityLevel = 0, firstChar = '') => {
            return { isConformToSecurityLevel, message, error, securityLevel, firstChar };
        };

        const firstChar = addressBase58.substring(0, 1);
        const securityLevel = utils.addressSecurityLevelByPrefix[firstChar];
        if (securityLevel === undefined) { return formatResult(false, `Invalid address firstChar: ${firstChar}`, false); }

        const bitsArray = utils.convert.hex.toBits(pubKeyHex);
        if (!bitsArray) { return formatResult(false, 'Invalid pubKeyHex', true); }

        const condition = binaryStringStartsWithZeros(bitsArray.join(''), securityLevel);
        if (!condition) { return formatResult(false, `Address does not meet the security level${securityLevel} requirements`, false, securityLevel, firstChar); }

        return formatResult(true, 'Address meets the security level requirements', false, securityLevel, firstChar);
    },
    /** ==> Third verification, higher computation cost. (ALWAYS use conformity check first)
     * @param {string} addressBase58 - Address to validate
     * @param {string} pubKeyHex - Public key to derive the address from
     */
    derivationCheck: async (addressBase58, pubKeyHex = '') => {
        const derivedAddressBase58 = await deriveAddress(pubKeyHex);
        if (!derivedAddressBase58) { console.error('Failed to derive the address'); return false; }

        return addressBase58 === derivedAddressBase58;
    }
}
//#endregion ----------------------

//#region - Conditions functions
/**
 * Check if the string starts with a certain amount of zeros
 * @param {string} string 
 * @param {number} zeros
 */
function binaryStringStartsWithZeros(string, zeros) {
    if (typeof string !== 'string') { return false; }
    if (typeof zeros !== 'number') { return false; }
    if (zeros < 0) { return false; }

    const target = '0'.repeat(zeros);
    return string.startsWith(target);
}
/**
 * Check if the string as binary is superior or equal to the target
 * @param {string} string 
 * @param {number} minValue 
 */
function binaryStringSupOrEqual(string = '', minValue = 0) {
    if (typeof string !== 'string') { return false; }
    if (typeof minValue !== 'number') { return false; }
    if (minValue < 0) { return false; }

    const intValue = parseInt(string, 2);
    return intValue >= minValue;
}
//#endregion ---------------------- 

//#region - mining functions
async function getBlockHash(blockSignature = '', nonce = '') {
    const { time, mem, parallelism, type, hashLen } = argon2_POW_Params;
    const newBlockHash = await argon2Hash(blockSignature, nonce, time, mem, parallelism, type, hashLen);
    if (!newBlockHash) { return false; }

    return newBlockHash;
}
function getDiff(difficulty = 1) {
    const zeros = Math.floor(difficulty / 16);
    const adjust = difficulty % 16;
    return { zeros, adjust };
}
function verifyBlockHash(HashBitsAsString = '', difficulty = 1) {
    if (typeof HashBitsAsString !== 'string') { return { isValid: false, error: 'Invalid HashBitsAsString', adjust: 0 }; }
    if (typeof difficulty !== 'number') { return { isValid: false, error: 'Invalid difficulty type', adjust: 0 }; }

    if (difficulty < 1) { return { isValid: false, error: 'Invalid difficulty < 1', adjust: 0 }; }
    if (difficulty > HashBitsAsString.length) { return { isValid: false, error: 'Invalid difficulty > HashBitsAsString.length', adjust: 0 }; }
    
    const { zeros, adjust } = getDiff(difficulty);

    const condition1 = binaryStringStartsWithZeros(HashBitsAsString, zeros);
    if (!condition1) { return { isValid: false, error: 'Invalid condition1', adjust }; }

    const next5Bits = HashBitsAsString.substring(zeros, zeros + 5);
    const condition2 = binaryStringSupOrEqual(next5Bits, adjust);
    if (!condition2) { return { isValid: false, error: 'Invalid condition2', adjust }; }

    return { isValid: true, error: '', adjust };
}
function generateRandomNonce(length) {
    const Uint8 = new Uint8Array(length);
    crypto.getRandomValues(Uint8);

    const Hex = Array.from(Uint8).map(b => b.toString(16).padStart(2, '0')).join('');

    return { Uint8, Hex };
}
//#endregion ----------------------

export default {
    argon2Hash,
    SHA256Hash,

    generateKeyPairFromHash,
    signMessage,

    deriveAddress,
    addressVerif,
    
    getBlockHash,
    verifyBlockHash,
    generateRandomNonce,
    argon2_POW_Params
};