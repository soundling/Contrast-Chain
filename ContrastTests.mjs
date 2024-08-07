const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
import contrast from './scripts/contrast.mjs';

//const ed25519_key = await crypto.subtle.generateKey('Ed25519', true /* extractable */, ['sign', 'verify']);

async function test() {
    const startTime = Date.now();

    /*const argon2HashResult = await contrast.crypto.argon2Hash('averylongpassword123456', 'saltsaltsaltsaltsalt');
    console.log(argon2HashResult);*/

    const wallet = await contrast.Wallet.restore();
    if (!wallet) { console.error('Failed to restore wallet.'); return; }
    console.log(wallet.pubKeyHex);
    
    const addresses = await wallet.deriveAddresses(10);
    if (!addresses) { console.error('Failed to derive addresses.'); return; }
    console.log(addresses);


    const endTime = Date.now();
    console.log('Time elapsed: ' + (endTime - startTime) + 'ms');
}; test();