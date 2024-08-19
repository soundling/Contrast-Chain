import { TxIO_Builder } from './TxIO.mjs';
import utils from './utils.mjs';
import { HashFunctions } from './conCrypto.mjs';
import {TxIO_Scripts} from './TxIO.mjs';
import { Account } from './index.mjs';

const Transaction = (inputs, outputs, id = '', witnesses = []) => {
    return {
        inputs,
        outputs,
        id,
        witnesses
    };
}
export class Transaction_Builder {
    /**
     * @param {string} nonceHex
     * @param {string} address 
     * @param {number} amount
     */
    static createCoinbaseTransaction(nonceHex, address, amount) {
        if (typeof nonceHex !== 'string') { throw new Error('Invalid nonceHex'); }
        if (typeof address !== 'string') { throw new Error('Invalid address'); }
        if (typeof amount !== 'number') { throw new Error('Invalid amount'); }

        const coinbaseOutput = TxIO_Builder.newIO('output', amount, address, 'signature_v1', 1);
        const inputs = [ nonceHex ];
        const outputs = [ coinbaseOutput ];

        return Transaction(inputs, outputs);
    }
    /** @param {TransactionIO[]} UTXOs - The UTXOs used as inputs */
    static createTransferTransaction(
        UTXOs = [],
        transfers = [ { recipientAddress: 'recipientAddress', amount: 1 } ]
    ) {
        if (UTXOs.length === 0) { throw new Error('No UTXO to spend'); }
        if (transfers.length === 0) { throw new Error('No transfer to make'); }
        
        TxIO_Builder.checkMissingTxID(UTXOs);

        const { outputs, totalSpent } = Transaction_Builder.buildOutputsFrom(transfers, 'signature_v1', 1);
        const totalInputAmount = UTXOs.reduce((a, b) => a + b.amount, 0);

        const fee = 1_000_000; // TODO: calculate the fee
        const change = totalInputAmount - totalSpent - fee;
        if (change < 0) { 
            throw new Error('Negative change => not enough funds'); 
        } else if (change > 0) {
            const changeOutput = TxIO_Builder.newIO("output", change, UTXOs[0].address, 'signature_v1', 1);
            outputs.push(changeOutput);
        }

        if (TxIO_Scripts.arrayIncludeDuplicates(outputs)) { throw new Error('Duplicate outputs'); }
        
        return Transaction(UTXOs, outputs);
    }
    /**
     * @param {{recipientAddress: string, amount: number}[]} transfers
     * @param {string} script
     * @param {number} version
     */
    static buildOutputsFrom(transfers = [{recipientAddress: 'recipientAddress', amount: 1,}], script = 'signature_v1', version = 1) {
        const outputs = [];
        const totalAmount = [];

        for (let i = 0; i < transfers.length; i++) {
            const { recipientAddress, amount} = transfers[i];
            const output = TxIO_Builder.newIO('output', amount, recipientAddress, script, version);
            outputs.push(output);
            totalAmount.push(amount);
        }

        const totalSpent = totalAmount.reduce((a, b) => a + b, 0);

        return { outputs, totalSpent };
    }
    /** @param {Transaction} transaction */
    static async hashTxToGetID(transaction) {
        const message = Transaction_Builder.getTransactionStringToHash(transaction);
        return HashFunctions.SHA256(message);
    }
    /** @param {Transaction} transaction */
    static getTransactionStringToHash(transaction) { // TODO: find a better unique element to make the hash unique
        const nonce = utils.mining.generateRandomNonce(); // random nonce to make the hash unique
        const inputsStr = JSON.stringify(transaction.inputs);
        const outputsStr = JSON.stringify(transaction.outputs);

        const stringHex = utils.convert.string.toHex(`${nonce}${inputsStr}${outputsStr}`);
        return stringHex;
    }
    /** 
     * @param {Transaction} transaction
     * @param {number} TxIndexInTheBlock
     */
    static isCoinBaseTransaction(transaction, TxIndexInTheBlock) {
        if (transaction.inputs.length !== 1) { return false; }
        if (TxIndexInTheBlock !== 0) { return false; }
        return typeof transaction.inputs[0] === 'string';
    }
    /** @param {Transaction} transaction */
    static isIncriptionTransaction(transaction) {
        if (transaction.outputs.length !== 1) { return false; }
        return typeof transaction.outputs[0] === 'string';
    }
    /** @param {Transaction} transaction */
    static getTransactionJSON(transaction) {
        return JSON.stringify(transaction)
    }
    static transactionFromJSON(transactionJSON) {
        return JSON.parse(transactionJSON);
    }

    /**
     * @param {Account} senderAccount
     * @param {number} amount
     * @param {string} recipientAddress
     * @returns promise {{signedTxJSON: string | false, error: false | string}}
     */
    static async createAndSignTransferTransaction(senderAccount, amount, recipientAddress) {
        try {
            const transfer = { recipientAddress, amount };
            const transaction = Transaction_Builder.createTransferTransaction(senderAccount.UTXOs, [transfer]);
            const signedTx = await senderAccount.signAndReturnTransaction(transaction);
            signedTx.id = await Transaction_Builder.hashTxToGetID(signedTx);
    
            return { signedTxJSON: Transaction_Builder.getTransactionJSON(signedTx), error: false };
        } catch (error) {
            /** @type {string} */
            const errorMessage = error.message;
            return { signedTxJSON: false, error: errorMessage };
        }
    }
}