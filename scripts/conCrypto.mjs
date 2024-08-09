import ed25519 from './noble-ed25519-03-2024.mjs';
import utils from './utils.mjs';

const addressPrefix = ["C"];
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

    result.isValid = await ed25519.verifyAsync(signature, messageHex, pubKeyHex);
    if (!result.isValid) { result.error = 'Failed to verify the signature'; return result; }

    result.signature = signature;
    return result;
}
/**
 * @param {string} signature 
 * @param {string} messageHex 
 * @param {string} pubKeyHex 
 * @returns 
 */
async function verifySignature(signature, messageHex, pubKeyHex) {
    const isValid = await ed25519.verifyAsync(signature, messageHex, pubKeyHex);
    return isValid;
}
//#endregion ----------------------

//#region - Address functions
/**
 * @param {string} address - Address to verify (base58)
 * @param {string} pubKeyHex - Public key to derive the address from
 */
async function verifyAddressFromPubKey(address, pubKeyHex) {
    const firstCharTest = validateAddress(address);
    if (!firstCharTest.isValidAddress) { return { isValid: false, error: firstCharTest.message }; }

    const { isValidAddress, addressBase58, firstChar } = await deriveAddress(pubKeyHex);
    if (!isValidAddress) { return { isValid: false, error: 'Failed to derive the address' }; }

    const isValid = addressBase58 === address;

    return { isValid, error: '' };
}
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
        return { isValidAddress: false, addressBase58: '', firstChar: '' };
    }
    
    const hex = argon2hash.hex;
    const addressBase58 = utils.convert.hex.toBase58(hex).substring(0, 20);
    const { isValidAddress, firstChar } = validateAddress(addressBase58);

    //const endTimestamp = Date.now();
    //const duration = endTimestamp - startTimestamp;
    return { isValidAddress, addressBase58, firstChar };
}
/** @param {string} addressBase58 - Address to validate */
function validateAddress(addressBase58) {
    if (typeof addressBase58 !== 'string') { return { isValidAddress: false, message: 'Invalid address type !== string', error: true }; }
    if (addressBase58.length !== 20) { return { isValidAddress: false, message: 'Invalid address length !== 20', error: true }; }

    const firstChar = addressBase58.substring(0, 1);
    if (addressPrefix.indexOf(firstChar) === -1) {
        return { isValidAddress: false, message: `Invalid address firstChar: ${firstChar}`, error: false };
    }

    return { isValidAddress: true, firstChar };
}
//#endregion ----------------------

//#region - mining functions
async function getBlockHash(blockSignature = '', nonce = '') {
    const { time, mem, parallelism, type, hashLen } = argon2_POW_Params;
    const newBlockHash = await argon2Hash(blockSignature, nonce, time, mem, parallelism, type, hashLen);
    if (!newBlockHash) { return false; }

    return newBlockHash;
}
function verifyBlockHash(HashBitsAsString = '', difficulty = 1) {
    if (typeof HashBitsAsString !== 'string') { return { isValid: false, error: 'Invalid HashBitsAsString' }; }
    if (typeof difficulty !== 'number') { return { isValid: false, error: 'Invalid difficulty type' }; }

    if (difficulty < 1) { return { isValid: false, error: 'Invalid difficulty < 1' }; }
    if (difficulty > HashBitsAsString.length) { return { isValid: false, error: 'Invalid difficulty > HashBitsAsString.length' }; }

    const target = '0'.repeat(difficulty);
    const isValid = HashBitsAsString.startsWith(target);

    return { isValid, error: '' };
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
    validateAddress,
    
    getBlockHash,
    verifyBlockHash,
    generateRandomNonce,
    argon2_POW_Params
};