
import { HashFunctions, AsymetricFunctions } from './conCrypto.mjs';
import utils from './utils.mjs';
import { Account} from './index.mjs';

export class Wallet {
    constructor(masterHex) {
        /** @type {string} */
        this.masterHex = masterHex; // 30 bytes - 60 chars
        /** @type {Object<string, Account[]>} */
        this.accounts = { // max accounts per type = 65 536
            W: [],
            C: [],
            S: [],
            P: [],
            U: []
        };
    }

    static async restore(mnemonicHex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") {
        const argon2HashResult = await HashFunctions.Argon2(mnemonicHex, "Contrast's Salt Isnt Pepper But It Is Tasty", 27, 1024, 1, 2, 26);
        if (!argon2HashResult) { return false; }

        return new Wallet(argon2HashResult.hex);
    }
    async deriveAccounts(nbOfAccounts = 1, addressPrefix = "C") {
        const nbOfExistingAccounts = this.accounts[addressPrefix].length;
        const iterationsPerAccount = []; // used for control

        for (let i = nbOfExistingAccounts; i < nbOfAccounts; i++) {
            const { account, iterations } = await this.deriveAccount(i, addressPrefix);
            if (!account) { console.error('deriveAccounts interrupted!'); return false; }

            iterationsPerAccount.push(iterations);
            this.accounts[addressPrefix].push(account);
        }
        
        const derivedAccounts = this.accounts[addressPrefix].slice(nbOfExistingAccounts);
        if (derivedAccounts.length !== nbOfAccounts) { console.error('Failed to derive all accounts'); return false; }
        return { derivedAccounts, avgIterations: iterationsPerAccount.reduce((a, b) => a + b, 0) / nbOfAccounts };
    }
    async deriveAccount(accountIndex = 0, addressPrefix = "C") {
        /** @type {AddressTypeInfo} */
        const addressTypeInfo = utils.addressUtils.glossary[addressPrefix];
        if (addressTypeInfo === undefined) { throw new Error(`Invalid addressPrefix: ${addressPrefix}`); }

        // To be sure we have enough iterations, but avoid infinite loop
        const maxIterations = 65_536 * (2 ** addressTypeInfo.zeroBits); // max with zeroBits(16): 65 536 * (2^16) => 4 294 967 296
        const seedModifierStart = accountIndex * maxIterations; // max with accountIndex: 65 535 * 4 294 967 296 => 281 470 681 743 360
        for (let i = 0; i < maxIterations; i++) {
            const seedModifier = seedModifierStart + i;
            const seedModifierHex = seedModifier.toString(16).padStart(12, '0'); // padStart(12, '0') => 48 bits (6 bytes), maxValue = 281 474 976 710 655
            const seedHex = this.masterHex + seedModifierHex;
            
            try {
                const keyPair = await AsymetricFunctions.generateKeyPairFromHash(seedHex);
                if (!keyPair) { console.error('Failed to generate key pair'); return false; }
    
                const addressBase58 = await utils.addressUtils.deriveAddress(HashFunctions.Argon2, keyPair.pubKeyHex);
                if (!addressBase58) { console.error('Failed to derive address'); return false; }
    
                if (addressBase58.substring(0, 1) !== addressPrefix) { continue; }
                
                utils.addressUtils.conformityCheck(addressBase58);
                utils.addressUtils.securityCheck(addressBase58, keyPair.pubKeyHex);

                const account = new Account(keyPair.pubKeyHex, keyPair.privKeyHex, addressBase58);
                return { account, iterations: i };
            } catch (error) {
                console.error(error.message);
                continue;
            }
        }

        return false;
    }
}
