import { Transaction_Builder } from './index.mjs';

import { AsymetricFunctions } from './conCrypto.mjs';
export class Account {
    /** @type {string} */
   #privKey = '';
   /** @type {string} */
   #pubKey = '';

   constructor(pubKey = '', privKey = '', address = '') {
       this.#pubKey = pubKey;
       this.#privKey = privKey;

       /** @type {string} */
       this.address = address;
       /** @type {TransactionIO[]} */
       this.UTXOs = [];
   }

   /** @param {Transaction} transaction */
   async signAndReturnTransaction(transaction) {
       if (typeof this.#privKey !== 'string') { throw new Error('Invalid private key'); }

       const message = Transaction_Builder.getTransactionStringToHash(transaction);
       const { signatureHex } = await AsymetricFunctions.signMessage(message, this.#privKey, this.#pubKey);
       if (transaction.witnesses.includes(signatureHex)) { throw new Error('Signature already included'); }

       transaction.witnesses.push(`${signatureHex} ${this.#pubKey}`);

       return transaction;
   }
   /** @param {string} UTXOsJSON */
   setUTXOsFromJSON(UTXOsJSON) {
       if (typeof UTXOsJSON !== 'string') { throw new Error('Invalid UTXOsJSON: not string'); }

       /** @type {TransactionIO[]} */
       const parsedUTXOsJSON = JSON.parse(UTXOsJSON);
       if (!Array.isArray(parsedUTXOsJSON)) { throw new Error(`parsedUTXOsJSON isn't an array`); }

       this.UTXOs = parsedUTXOsJSON;
   }
}