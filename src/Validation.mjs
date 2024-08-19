import { HashFunctions } from './conCrypto.mjs';
import { Transaction_Builder } from './Transaction.mjs';
import utils from './utils.mjs';
import { TxIO_Builder } from './TxIO.mjs';

export class Validation {
    /** ==> First validation, low computation cost.
     * 
     * - control format of : amount, address, script, version, TxID
     * @param {Transaction} transaction
     * @param {boolean} isCoinBase
     */
    static isConformTransaction(transaction, isCoinBase) {
        if (!transaction) { throw new Error('Invalid transaction'); }
        if (typeof transaction.id !== 'string') { throw new Error('Invalid transaction ID'); }
        if (!Array.isArray(transaction.inputs)) { throw new Error('Invalid transaction inputs'); }
        if (!Array.isArray(transaction.outputs)) { throw new Error('Invalid transaction outputs'); }
        if (!Array.isArray(transaction.witnesses)) { throw new Error('Invalid transaction witnesses'); }

        for (let i = 0; i < transaction.inputs.length; i++) {
            if (isCoinBase) { continue; } // coinbase -> no input
            Validation.isValidTransactionIO(transaction.inputs[i]);
        }

        for (let i = 0; i < transaction.outputs.length; i++) {
            const TxID_Check = isCoinBase // not coinbase -> output not linked to TxID
            Validation.isValidTransactionIO(transaction.outputs[i], TxID_Check);
        }
    }
    /** Used by isConformTransaction()
     * @param {TransactionIO} TxIO - transaction input/output
     * @param {boolean} TxID_Check - check if the TxID is present and valid
     */
    static isValidTransactionIO(TxIO, TxID_Check = true) {
        if (typeof TxIO.amount !== 'number') { throw new Error('Invalid amount'); }
        if (TxIO.amount <= 0) { throw new Error('Invalid amount value: <= 0'); }
        if (typeof TxIO.script !== 'string') { throw new Error('Invalid script !== string'); }
        if (typeof TxIO.version !== 'number') { throw new Error('Invalid version !== number'); }
        if (TxIO.version <= 0) { throw new Error('Invalid version value: <= 0'); }

        if (TxID_Check && typeof TxIO.TxID !== 'string') {
             throw new Error('Invalid TxID'); }

        utils.addressUtils.conformityCheck(TxIO.address);
    }

    /** ==> Second validation, low computation cost.
     * 
     * - control : input > output
     * 
     * - control the fee > 0 or = 0 for coinbase
     * @param {Transaction} transaction
     * @param {boolean} isCoinbaseTx
     * @returns {number} - the fee
     */
    static calculateRemainingAmount(transaction, isCoinbaseTx) {
        const inputsAmount = transaction.inputs.reduce((a, b) => a + b.amount, 0);
        const outputsAmount = transaction.outputs.reduce((a, b) => a + b.amount, 0);
        const fee = inputsAmount - outputsAmount;
        if (fee < 0) { throw new Error('Negative transaction'); }
        if (isCoinbaseTx && fee !== 0) { throw new Error('Invalid coinbase transaction'); }
        if (!isCoinbaseTx && fee === 0) { throw new Error('Invalid transaction: fee = 0'); }

        return fee;
    }

    /** ==> Third validation, medium computation cost.
     * 
     * - control the transaction hash (SHA256)
     * @param {Transaction} transaction
     */
    static async controlTransactionHash(transaction) {
        const message = Transaction_Builder.getTransactionStringToHash(transaction);
        const hash = await HashFunctions.SHA256(message);
        if (hash !== transaction.id) { throw new Error('Invalid transaction hash'); }
    }

    /** ==> Fourth validation, medium computation cost.
     * 
     * - control the signature of the inputs
     * @param {Transaction} transaction
     */
    static async executeTransactionInputsScripts(transaction) {
        //const addresses = transaction.inputs.map(input => input.address);
        
        // TODO: ADAPT THE LOGIC FOR MULTI WITNESS
        const opAlreadyPassed = [];
        const witnessParts = transaction.witnesses[0].split(' ');
        const signature = witnessParts[0];
        const pubKeyHex = witnessParts[1];

        for (let i = 0; i < transaction.inputs.length; i++) {
            //const input = transaction.inputs[i];
            const { address, script } = transaction.inputs[i];
            const operation = `${address}${script}`;
            if (opAlreadyPassed.includes(operation)) {
                continue; }

            utils.addressUtils.conformityCheck(address);
            utils.addressUtils.securityCheck(address, pubKeyHex);
            
            const message = Transaction_Builder.getTransactionStringToHash(transaction);
            Validation.executeTransactionInputScripts(script, signature, message, pubKeyHex);

            opAlreadyPassed.push(operation);
        }
    }
    /** // TODO: TRANSFORM SCRIPT LOGIC TO HUMAN READABLE LOGIC -> INPUT LOOKS LIKE : BY:ADDRESS-SIG:SIGNATURE-PUB:pubKeyHex ?
     * @param {string} script
     * @param {string} address
     * @param {string} signature
     * @param {string} pubKeyHex
     */
    static executeTransactionInputScripts(script, signature, message, pubKeyHex) {
        const scriptFunction = TxIO_Builder.getAssociatedScript(script);
        if (!scriptFunction) { throw new Error('Invalid script'); }

        const addressOwnedByPubKey = scriptFunction(signature, message, pubKeyHex);
        if (!addressOwnedByPubKey) { throw new Error('Invalid signature<->pubKey correspancy'); }
    }

    /** ==> Fifth validation, high computation cost.
     * 
     * - control the address/pubKey correspondence
     * @param {Transaction} transaction
     */
    static async addressOwnershipConfirmation(transaction) {
        const witnessesAddresses = [];
        const alreadyKnownAddresses = [];

        // derive witnesses addresses
        for (let i = 0; i < transaction.witnesses.length; i++) {
            const witnessParts = transaction.witnesses[i].split(' ');
            const pubKeyHex = witnessParts[1];
            const derivedAddressBase58 = await utils.addressUtils.deriveAddress(HashFunctions.Argon2, pubKeyHex);
            if (witnessesAddresses.includes(derivedAddressBase58)) { throw new Error('Duplicate witness'); }

            witnessesAddresses.push(derivedAddressBase58);
        }

        // control the input addresses presence in the witnesses
        for (let i = 0; i < transaction.inputs.length; i++) {
            const { address } = transaction.inputs[i];
            if (witnessesAddresses.includes(address) === false) { throw new Error(`Witness missing for address: ${utils.addressUtils.formatAddress(address)}`); }

            alreadyKnownAddresses.push(address);
        }
    }
}