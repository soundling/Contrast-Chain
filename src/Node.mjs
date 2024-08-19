
import storage from './storage.mjs';
import { BlockData, Block, Transaction_Builder, Validation } from './index.mjs';

import utils from './utils.mjs';
import { TxIO_Builder } from './index.mjs';

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