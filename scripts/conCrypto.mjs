const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

import ed25519 from './noble-ed25519-03-2024.mjs';
import utils from './utils.mjs';
const cryptoLib = isNode ? crypto : window.crypto;
let argon2;
if (isNode) {
    argon2 = await import('argon2');
    argon2.limits.timeCost.min = 1;
} else {
    const argon2Import = await import('./argon2-ES6.min.mjs');
    argon2 = argon2Import.default;
    window.argon2 = argon2;
}

//#region - Argon2 Standardization
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
        salt: isNode ? Buffer.from(salt) : salt,
    };
}
function standardizeArgon2FromEncoded(encoded = '$argon2id$v=19$m=1048576,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$UamPN/XTTX4quPewQNw4/s3y1JJeS22cRroh5l7OTMM') {
    const splited = encoded.split('$');
    const base64 = splited.pop();
    const hash = utils.convert.base64.toUint8Array(base64);
    const hex = utils.convert.uint8Array.toHex(hash);
    const bitsArray = utils.convert.hex.toBits(hex);

    return { encoded, hash, hex, bitsArray };
}
/**
 * This function hashes a password using Argon2.
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
    const hashResult = isNode ? await argon2.hash(pass, params) : await argon2.hash(params);
    if (!hashResult) { return false; }

    const encoded = hashResult.encoded ? hashResult.encoded : hashResult;
    const result = standardizeArgon2FromEncoded(encoded);

    return result;
}
//#endregion ----------------------

/** @param {string} privKeyHex - Hexadecimal representation of the private key */
async function generateKeyPairFromHash(privKeyHex) {
    if (privKeyHex.length !== 64) { console.error('Hash must be 32 bytes long (hex: 64 chars)'); return false; }
    
    // Calculer la clé publique à partir de la clé privée
    const publicKey = await ed25519.getPublicKeyAsync(privKeyHex);
    const pubKeyHex = utils.uint8ArrayToHex(publicKey);
  
    return { privKeyHex, pubKeyHex };
}
/** 
* @param {number} addressIndex - Index of the address to derive
* @param {string} pubKeyHex - Public key to derive the address from
*/
async function deriveAddress(addressIndex, pubKeyHex) {
    if (typeof addressIndex !== 'number') { console.error('Address index must be a number'); return false; }
    if (addressIndex > 3363) { console.error('Cannot derive more than 3363 addresses per pubKey'); return false; }

    const prefix = "BCE";
    const addressIndexHex = addressIndex.toString(16).padStart(4, '0');

    const pubKeyUint8Array = utils.hexToUint8Array(pubKeyHex + addressIndexHex);
    const hash = await cryptoLib.subtle.digest('SHA-256', pubKeyUint8Array);
    const hashHex = utils.uint8ArrayToHex(new Uint8Array(hash));
    const hashBase58 = utils.hexToBase58(hashHex);
    
    const addressArray = [prefix, hashBase58];
    let address = addressArray.join('').substring(0, 42);
    address += await getChecksumFromAddress(address);

    if (!await validateAddress(address)) { console.error('Address is not valid'); return false; }

    return address;
}
/** 
 * @param {string} address - Address to get the checksum from
 * @returns {promise<string>} - Checksum base58 (2 chars)
 */
async function getChecksumFromAddress(address) {
    const addressUint8Array = utils.hexToUint8Array(address);
    const checksum = await cryptoLib.subtle.digest('SHA-256', addressUint8Array);
    const checksumHex = utils.uint8ArrayToHex(new Uint8Array(checksum));
    const checksumBase58 = utils.hexToBase58(checksumHex);

    return checksumBase58.substring(0, 2);
}
async function validateAddress(address) {
    const prefix = address.substring(0, 3);
    if (prefix !== 'BCE') { return false; };

    const checksum = address.substring(address.length - 2); // Last 2 chars
    
    const addressWithoutChecksum = address.substring(0, 42);
    const calculatedChecksum = await getChecksumFromAddress(addressWithoutChecksum);

    return checksum === calculatedChecksum;
}

export default {
    cryptoLib,
    argon2Hash,
    generateKeyPairFromHash,
    deriveAddress
};