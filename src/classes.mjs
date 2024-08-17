'use strict';

import { HashFunctions, AsymetricFunctions } from './conCrypto.mjs';
import storage from "./storage.mjs";
import utils from './utils.mjs';

export class AddressTypeInfo {
    name = '';
    description = '';
    zeroBits = 0;
    nbOfSigners = 1;
}

/**
* @typedef {Object} BlockData
* @property {number} index - The index of the block
* @property {number} supply - The total supply before the coinbase reward
* @property {number} coinBase - The coinbase reward
* @property {number} difficulty - The difficulty of the block
* @property {string} prevHash - The hash of the previous block
* @property {Transaction[]} Txs - The transactions in the block
* @property {number | undefined} timestamp - The timestamp of the block
* @property {string | undefined} hash - The hash of the block
* @property {number | undefined} nonce - The nonce of the block
*/
/**
 * @param {number} index - The index of the block
 * @param {number} supply - The total supply before the coinbase reward
 * @param {number} coinBase - The coinbase reward
 * @param {number} difficulty - The difficulty of the block
 * @param {string} prevHash - The hash of the previous block
 * @param {Transaction[]} Txs - The transactions in the block
 * @param {number | undefined} timestamp - The timestamp of the block
 * @param {string | undefined} hash - The hash of the block
 * @param {number | undefined} nonce - The nonce of the block
 * @returns {BlockData}
 */
export const BlockData = (index, supply, coinBase, difficulty, prevHash, Txs, timestamp, hash, nonce) => {
    return {
        index: index,
        supply: supply,
        coinBase: coinBase,
        difficulty: difficulty,
        prevHash: prevHash,
        Txs: Txs,

        // Proof of work dependent
        timestamp: timestamp,
        hash: hash,
        nonce: nonce
    };
}
export class Block {
    /** @param {BlockData} blockData */
    static getBlockStringToHash(blockData) {
        const txsIDStrArray = blockData.Txs.map(tx => tx.id);
        const txsIDStr = txsIDStrArray.join('');

        const signatureStr = `${blockData.prevHash}${blockData.timestamp}${blockData.index}${blockData.supply}${blockData.difficulty}${txsIDStr}${blockData.coinBase}${blockData.fee}`;
        return utils.convert.string.toHex(signatureStr);
    }
    /** @param {BlockData} blockData */
    static async calculateHash(blockData) {
        const blockSignatureHex = Block.getBlockStringToHash(blockData);
        const newBlockHash = await utils.mining.hashBlockSignature(HashFunctions.Argon2, blockSignatureHex, blockData.nonce);
        if (!newBlockHash) { throw new Error('Invalid block hash'); }

        return { hex: newBlockHash.hex, bitsArrayAsString: newBlockHash.bitsArray.join('') };
    }
    /**
     * @param {BlockData} blockData
     * @param {Transaction} coinbaseTx
     */
    static setCoinbaseTransaction(blockData, coinbaseTx) {
        if (Transaction_Builder.isCoinBaseTransaction(coinbaseTx, 0) === false) { console.error('Invalid coinbase transaction'); return false; }

        Block.removeExistingCoinbaseTransaction(blockData);
        blockData.Txs.unshift(coinbaseTx);
    }
    /** @param {BlockData} blockData */
    static removeExistingCoinbaseTransaction(blockData) {
        if (blockData.Txs.length === 0) { return; }

        const firstTx = blockData.Txs[0];
        if (firstTx && Transaction_Builder.isCoinBaseTransaction(firstTx, 0)) { blockData.Txs.shift(); }
    }
    /** @param {BlockData} blockData - undefined if genesis block */
    static calculateNextCoinbaseReward(blockData) {
        if (!blockData) { throw new Error('Invalid blockData'); }

        const halvings = Math.floor( (blockData.index + 1) / utils.blockchainSettings.halvingInterval );
        const coinBase = Math.max( utils.blockchainSettings.blockReward / Math.pow(2, halvings), utils.blockchainSettings.minBlockReward );

        const maxSupplyWillBeReached = blockData.supply + coinBase >= utils.blockchainSettings.maxSupply;
        return maxSupplyWillBeReached ? utils.blockchainSettings.maxSupply - blockData.supply : coinBase;
    }
    /** @param {BlockData} blockData */
    static calculateBlockTotalFees(blockData) {
        // TODO - calculate the fee
        const fees = [];
        for (let i = 0; i < blockData.Txs.length; i++) {
            const Tx = blockData.Txs[i];
            const fee = Validation.calculateRemainingAmount(Tx, Transaction_Builder.isCoinBaseTransaction(Tx, i));

            fees.push(fee);
        }

        const totalFees = fees.reduce((a, b) => a + b, 0);
        return totalFees;
    }
    /** @param {BlockData} blockData */
    static dataAsJSON(blockData) {
        return JSON.stringify(blockData);
    }
    /** @param {string} blockDataJSON */
    static blockDataFromJSON(blockDataJSON) {
        const parsed = JSON.parse(blockDataJSON);
        //const Txs = Block.TransactionsFromJSON(parsed.Txs);
        /** @type {BlockData} */
        return BlockData(parsed.index, parsed.supply, parsed.coinBase, parsed.difficulty, parsed.prevHash, parsed.Txs, parsed.timestamp, parsed.hash, parsed.nonce);
    }
    /** @param {BlockData} blockData */
    static cloneBlockData(blockData) {
        const JSON = Block.dataAsJSON(blockData);
        return Block.blockDataFromJSON(JSON);
    }
}

class TxIO_Scripts {
    static lock = {
        signature: {
            /**
             * @param {string} signature
             * @param {string} message
             * @param {string} pubKeyHex
             */
            v1: (signature, message, pubKeyHex) => {
                return AsymetricFunctions.verifySignature(signature, message, pubKeyHex);
            }
        }
    }

    static arrayIncludeDuplicates(array) { // is it used ? - preferable to delete
        return (new Set(array)).size !== array.length;
    }

    static decomposeScriptString(script) {
    }
}

/**
 * @typedef {Object} TransactionIO
 * @property {number} amount
 * @property {string} address
 * @property {string} script
 * @property {number} version
 * @property {number | undefined} index
 * @property {string | undefined} TxID
 */
/** Transaction Input/Output data structure
 * @param {number} amount
 * @param {string} address
 * @param {string} script
 * @param {number} version  
 * @param {string | undefined} TxID
 * @returns {TransactionIO}
 **/
const TransactionIO = (amount, address, script, version, TxID = undefined) => {
    return {
        amount,
        address,
        script,
        version,
        TxID
    };
}
export class TxIO_Builder {
    /**
     * @param {"input" | "output"} type
     * @param {number} amount
     * @param {string} address
     * @param {string} script
     * @param {number} version
     * @param {number | undefined} index
     * @param {string | undefined} TxID
     */
    static newIO(type, amount, address, script, version, TxID) {
        if (type !== 'input' && type !== 'output') { throw new Error('Invalid type'); }
        if (typeof amount !== 'number') { throw new Error('Invalid amount'); }
        if (amount <= 0) { throw new Error('Invalid amount value: <= 0'); }
        if (typeof script !== 'string') { throw new Error('Invalid script !== string'); }
        if (typeof version !== 'number') { throw new Error('Invalid version !== number'); }
        if (version <= 0) { throw new Error('Invalid version value: <= 0'); }

        utils.addressUtils.conformityCheck(address);
        
        const TxIO_Script = TxIO_Builder.getAssociatedScript(script);
        if (!TxIO_Script) { 
            throw new Error('Invalid script'); }

        return TransactionIO(amount, address, script, version, TxID);
    }
    /**
     * @param {string} script
     * @param {string} type - 'lock' or 'unlock'
     */
    static getAssociatedScript(script) {
        const scriptName = script.split('_')[0];
        const scriptVersion = script.split('_')[1];

        if (TxIO_Scripts.lock[scriptName] === undefined) {
            throw new Error('Invalid script name'); }
        if (TxIO_Scripts.lock[scriptName][scriptVersion] === undefined) { throw new Error('Invalid script version'); }

        return TxIO_Scripts.lock[scriptName][scriptVersion];
    }
    /** @param {TransactionIO[]} TxIOs */
    static checkMissingTxID(TxIOs) {
        if (TxIOs.length === 0) { throw new Error('No UTXO to check'); }

        const txIDs = TxIOs.map(TxIO => TxIO.TxID);
        if (txIDs.includes(undefined)) { throw new Error('One UTXO has no TxID'); }
        if (TxIO_Scripts.arrayIncludeDuplicates(txIDs)) { throw new Error('Duplicate TxID in UTXOs'); }
    }
}

/**
 * @typedef {Object} Transaction
 * @property {TransactionIO[]} inputs
 * @property {TransactionIO[]} outputs
 * @property {string} id
 * @property {string[]} witnesses
 */
/** Transaction data structure
 * @param {TransactionIO[]} inputs
 * @param {TransactionIO[]} outputs
 * @param {string} id
 * @param {string[]} witnesses
 * @returns {Transaction}
 */
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

class Validation {
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
class MemPool {
    constructor() {
        /** @type {Transaction[]} */
        this.transactions = [];
    }

    getMostLucrativeTransactions(maxTxs = 1000) { //TODO: improve the selection - use bytes weight instead of maxTx
        /*const sortedTxs = this.transactions.sort((a, b) => {
            const aFee = a.fee;
            const bFee = b.fee;

            if (aFee === bFee) { return 0; }
            return aFee > bFee ? -1 : 1;
        });*/

        return this.transactions.slice(0, maxTxs);
    }

    /**
     * Remove the transactions included in the block from the mempool
     * @param {Transaction[]} Txs
     */
    digestBlockTransactions(Txs) {
        if (!Array.isArray(Txs)) { throw new Error('Txs is not an array'); }

        const txIDs = Txs.map(tx => tx.id);
        const filteredTxs = this.transactions.filter(tx => !txIDs.includes(tx.id));
        this.transactions = filteredTxs;
    }

    /** @param {Transaction} transaction */
    async pushTransaction(transaction) {
        const startTime = Date.now();
        if (this.transactions.map(tx => tx.id).includes(transaction.id)) { throw new Error('Transaction already in mempool'); }
        
        const isCoinBase = false;

        // First control format of : amount, address, script, version, TxID
        Validation.isConformTransaction(transaction, isCoinBase);

        // Second control : input > output
        const fee = Validation.calculateRemainingAmount(transaction, isCoinBase);

        // Third validation: medium computation cost.
        await Validation.controlTransactionHash(transaction);

        // Fourth validation: medium computation cost.
        await Validation.executeTransactionInputsScripts(transaction);

        // Fifth validation: high computation cost.
        await Validation.addressOwnershipConfirmation(transaction);

        // Time passed we need to recheck before pushing the transaction
        if (this.transactions.map(tx => tx.id).includes(transaction.id)) { throw new Error('Transaction already in mempool'); }

        this.transactions.push(transaction);
        console.log(`Transaction pushed in mempool in ${Date.now() - startTime}ms`);
    }
}
class HotData { // Used to store, addresses's UTXOs and balance.
    constructor() {
        /** @type {Object<string, UTXO[]>} */
        this.addressUTXOs = {};
        /** @type {Object<string, number>} */
        this.addressBalances = {};
    }

    /** @param {Block[]} chain */
    digestChain(chain) {
        for (let i = 0; i < chain.length; i++) {
            //console.log(`Digesting block ${i}`);
            const Txs = chain[i].Txs;
            this.digestBlockTransactions(Txs, false);
        }
    }
    /** @param {BlockData} blockData */
    digestBlock(blockData) {
        const Txs = blockData.Txs;
        this.digestBlockTransactions(Txs);

        const supplyFromBlock = blockData.supply;
        const coinBase = blockData.coinBase;
        const totalSupply = supplyFromBlock + coinBase;
        const totalOfBalances = this.#calculateTotalOfBalances();

        const currencySupply = utils.convert.number.formatNumberAsCurrency(totalSupply);
        const currencyBalances = utils.convert.number.formatNumberAsCurrency(totalOfBalances);
        //console.log(`supplyFromBlock+coinBase: ${readableSupply} - totalOfBalances: ${readableBalances}`);
        if (totalOfBalances !== totalSupply) { 
            console.info(`supplyFromBlock+coinBase: ${currencySupply} - totalOfBalances: ${currencyBalances}`);
            throw new Error('Invalid total of balances'); 
        }
    }
    #calculateTotalOfBalances() {
        const addresses = Object.keys(this.addressBalances);
        return addresses.reduce((a, b) => a + this.addressBalances[b], 0);
    }
    /** @param {Transaction[]} Txs */
    digestBlockTransactions(Txs, logs = true) {
        if (!Array.isArray(Txs)) { throw new Error('Txs is not an array'); }

        for (let i = 0; i < Txs.length; i++) {
            const transaction = Txs[i];
            this.#digestTransactionInputs(transaction, i);
            this.#digestTransactionOutputs(transaction);
        }

        if (!logs) { return }; //Debug  log only :

        const address = Txs[0].outputs[0].address;
        const remainingUTXOs = this.addressUTXOs[address] ? this.addressUTXOs[address].length : 0;
        const balance = this.addressBalances[address] ? this.addressBalances[address] : 0;
        console.log(`remaining UTXOs for [ ${utils.addressUtils.formatAddress(address, '.')} ] ${remainingUTXOs} utxos - balance: ${utils.convert.number.formatNumberAsCurrency(balance)}`);
    }
    /**
     * Will add or remove the amount from the address balance
     * @param {string} address 
     * @param {number} amount 
     */
    #changeBalance(address, amount) {
        if (typeof amount !== 'number') { throw new Error('Invalid amount'); }
        if (amount === 0) { return; }
        if (this.addressBalances[address] === undefined) { this.addressBalances[address] = 0; }

        this.addressBalances[address] += amount;
        // console.log(`Balance of ${address} changed by ${amount} => ${this.addressBalances[address]}`);
    }
    /**
     * @param {Transaction} transaction 
     * @param {number} TxIndexInTheBlock
     */
    #digestTransactionInputs(transaction, TxIndexInTheBlock) {
        if ( Transaction_Builder.isCoinBaseTransaction(transaction, TxIndexInTheBlock) ) { return } // coinbase -> no input

        const TxInputs = transaction.inputs;
        for (let i = 0; i < TxInputs.length; i++) {
            
            TxIO_Builder.checkMissingTxID(TxInputs);
            
            const { address, amount } = TxInputs[i];
            this.#changeBalance(address, -amount);
            this.#removeUTXO(address, TxInputs[i]);
        }
    }
    /**
     * @param {string} address
     * @param {TransactionIO} utxo
     */
    #removeUTXO(address, utxo) {
        if (this.addressUTXOs[address] === undefined) { throw new Error(`${address} has no UTXOs`); }

        const index = this.addressUTXOs[address].findIndex(utxoInArray => utxoInArray.TxID === utxo.TxID);
        if (index === -1) { 
            throw new Error(`${address} isn't owning UTXO: ${utxo.TxID}`); }

        this.addressUTXOs[address].splice(index, 1);
        if (this.addressUTXOs[address].length === 0) { delete this.addressUTXOs[address]; }
    }
    /** @param {Transaction} transaction */
    #digestTransactionOutputs(transaction) {
        const TxID = transaction.id;
        const TxOutputs = transaction.outputs;
        for (let i = 0; i < TxOutputs.length; i++) {
            TxOutputs[i].TxID = TxID;
            
            const { address, amount } = TxOutputs[i];
            this.#changeBalance(address, amount);

            if (this.addressUTXOs[address] === undefined) { this.addressUTXOs[address] = []; }
            this.addressUTXOs[address].push(TxOutputs[i]);
        }
    }
    /** @param {string} address */
    getUTXOsJSON(address) {
        const UTXOs = this.addressUTXOs[address] ? this.addressUTXOs[address] : [];
        return JSON.stringify(UTXOs);
    }
}
export class FullNode {
    constructor(chain) {
        /** @type {BlockData[]} */
        this.chain = chain || [];
        /** @type {BlockData} */
        this.blockCandidate = null;

        this.memPool = new MemPool();
        this.hotData = new HotData();
    }

    static load(saveBlocksInfo = true) {
        const chain = storage.loadBlockchainLocally('bin');
        const node = new FullNode(chain);
        node.hotData.digestChain(chain);

        if (saveBlocksInfo) { // basic informations .csv
            const blocksInfo = node.#getBlocksMiningInfo();
            storage.saveBlockchainInfoLocally(blocksInfo);
        }

        // TODO: Get the Txs from the mempool and add them
        // TODO: Verify the Txs
        const Txs = node.memPool.getMostLucrativeTransactions();
        node.blockCandidate = node.#createBlockCandidate(Txs);

        return node;
    }
    /**
     * @param {string} nonceHex
     * @param {number} hashTime
     * @param {Transaction} coinbaseTxSigned
     */
    async blockProposal(nonceHex = '',  hashTime = 0, coinbaseTxSigned = undefined) {
        if (typeof nonceHex !== 'string') { throw new Error('Invalid nonceHex'); }
        if (typeof hashTime !== 'number') { throw new Error('Invalid hashTime'); }
        if (nonceHex.length < utils.mining.minNonceHexLength) { throw new Error('Invalid nonce length'); } 

        const blockCandidate = Block.cloneBlockData(this.blockCandidate);
        blockCandidate.timestamp = hashTime;
        blockCandidate.nonce = nonceHex;
        Block.setCoinbaseTransaction(blockCandidate, coinbaseTxSigned);

        const { hex, bitsArrayAsString } = await Block.calculateHash(blockCandidate);
        utils.mining.verifyBlockHashConformToDifficulty(bitsArrayAsString, blockCandidate.difficulty);

        blockCandidate.hash = hex;
        
        if (this.chain.length < 20) { storage.saveBlockDataLocally(blockCandidate, 'json'); }
        const saveResult = storage.saveBlockDataLocally(blockCandidate, 'bin');
        if (!saveResult.success) { throw new Error(saveResult.message); }

        //TODO : VALIDATE THE BLOCK BEFORE PUSHING IT !!
        this.chain.push(blockCandidate);
        this.hotData.digestBlock(blockCandidate);
        this.memPool.digestBlockTransactions(blockCandidate.Txs);
        
        const TransactionsToInclude = this.memPool.getMostLucrativeTransactions(1000);
        const newBlockCandidate = this.#createBlockCandidate(TransactionsToInclude);
        this.blockCandidate = newBlockCandidate; // Can be sent to the network

        return true;
    }
    /** @param {Transaction} signedTxJSON */
    async addTransactionJSONToMemPool(signedTxJSON) {
        if (!signedTxJSON) { throw new Error('Invalid transaction'); }
        try {
            const signedTansaction = Transaction_Builder.transactionFromJSON(signedTxJSON);
            await this.memPool.pushTransaction(signedTansaction);
        } catch (error) {
            console.info(`[ Tx_Refused }----------{ ${error.message} ]`);
        }
    }

    // TODO: Fork management

    // Private methods
    /** @param {Transaction[]} Txs */
    #createBlockCandidate(Txs = []) {
        if (this.chain.length === 0) {
            const coinbaseReward = utils.blockchainSettings.blockReward;
            const prevHash = 'ContrastGenesisBlock';
            return BlockData(0, 0, coinbaseReward, 1, prevHash, Txs);
        }

        const newDifficulty = utils.mining.difficultyAdjustment(this.chain);
        const lastBlockData = this.chain[this.chain.length - 1];
        const clone = Block.cloneBlockData(lastBlockData);
        const supply = clone.supply + clone.coinBase;
        const coinBaseReward = Block.calculateNextCoinbaseReward(clone);

        return BlockData(clone.index + 1, supply, coinBaseReward, newDifficulty, clone.hash, Txs);
    }
    #getBlocksMiningInfo() {
        const blocksInfo = [];

        for (let i = 0; i < this.chain.length; i++) {
            const block = this.chain[i];

            blocksInfo.push({ 
                blockIndex: block.index,
                coinbaseReward: block.coinBase,
                timestamp: block.timestamp,
                difficulty: block.difficulty,
                timeBetweenBlocks: i === 0 ? 0 : block.timestamp - this.chain[i - 1].timestamp
            });
        }

        return blocksInfo;
    }
}
export class LightNode {
    
}

export class Miner {
    /** @param {Account} minerAccount */
    constructor(minerAccount) {
        /** @type {Account} */
        this.minerAccount = minerAccount;
    }

    /** @param {BlockData} blockCandidate */
    async minePow(blockCandidate) {
        const nonce = utils.mining.generateRandomNonce();
        const minerAddress = this.minerAccount.address;

        const blockFees = Block.calculateBlockTotalFees(blockCandidate);
        const coinbaseTx = Transaction_Builder.createCoinbaseTransaction(nonce.Hex, minerAddress, blockCandidate.coinBase + blockFees);
        coinbaseTx.id = await Transaction_Builder.hashTxToGetID(coinbaseTx);

        blockCandidate.timestamp = Date.now();
        blockCandidate.nonce = nonce.Hex;
        Block.setCoinbaseTransaction(blockCandidate, coinbaseTx);

        const { hex, bitsArrayAsString } = await Block.calculateHash(blockCandidate);
        utils.mining.verifyBlockHashConformToDifficulty(bitsArrayAsString, blockCandidate.difficulty);

        blockCandidate.hash = hex;
        console.log(`POW -> [index:${blockCandidate.index}] | Diff = ${blockCandidate.difficulty} | coinBase = ${utils.convert.number.formatNumberAsCurrency(blockCandidate.coinBase)}`);

        return { validBlockCandidate: blockCandidate, nonceHex: blockCandidate.nonce, hashTime: blockCandidate.timestamp, coinbaseTx };
    }
}