'use strict';
import conCrypto from './conCrypto.mjs';
import storage from "./storage.mjs";
import utils from './utils.mjs';

export class Block {
    /**
     * @param {number} difficulty
     * @param {Transaction[]} Txs
     * @param {Block} lastBlock
     */
    constructor(difficulty, Txs, lastBlock = undefined) {
        // Proof of work dependent
        /** @type {number} */
        this.timestamp = undefined;
        /** @type {string} */
        this.hash = undefined;
        /** @type {string} */
        this.nonce = undefined;

        /** @type {string} */
        this.prevHash = lastBlock ? lastBlock.hash : 'ContrastGenesisBlock';
        /** @type {number} */
        this.index = lastBlock ? lastBlock.index + 1 : 0;
        /** @type {number} */
        this.supplyBefore = lastBlock ? lastBlock.supply : 0;
        /** @type {number} */
        this.coinBase = this.#calculateCoinbaseReward();
        /** @type {number} */
        this.supply = this.supplyBefore + this.coinBase;
        /** @type {number} */
        this.difficulty = difficulty ? difficulty : 1;
        /** @type {number} */
        this.fee = this.#calculateFee();
        /** @type {Transaction[]} */
        this.Txs = Txs ? Txs : [];
    }

    getBlockSignature() {
        const TxsStr = JSON.stringify(this.Txs);
        const signatureStr = `${this.prevHash}${this.timestamp}${this.index}${this.supply}${this.difficulty}${TxsStr}`;
        const signatureHex = utils.convert.string.toHex(signatureStr);
        return signatureHex;
    }
    async calculateHash(nonceHex = '') {
        const blockSignatureHex = this.getBlockSignature();
        const newBlockHash = await conCrypto.getBlockHash(blockSignatureHex, nonceHex);
        if (!newBlockHash) { return { success: false, message: 'Invalid bitsArrayAsNumbers' }; }

        return { success: true, hashBitsString: newBlockHash.bitsArray.join(''), hashHex: newBlockHash.hex };
    }
    getBlockContent() {
        return {
            timestamp: this.timestamp,
            hash: this.hash,
            nonce: this.nonce,

            prevHash: this.prevHash,
            index: this.index,
            supplyBefore: this.supplyBefore,
            coinBase: this.coinBase,
            supply: this.supply,
            difficulty: this.difficulty,
            Txs: this.Txs,
            fee: this.fee
        };
    }
    #calculateCoinbaseReward() {
        const coinBaseBasis = utils.blockchainSettings.blockReward;
        let coinBase = coinBaseBasis;
        
        const halvings = Math.floor(this.index / utils.blockchainSettings.halvingInterval);
        coinBase = coinBaseBasis / Math.pow(2, halvings);
        coinBase = Math.max(coinBase, utils.blockchainSettings.minBlockReward);

        if (this.supplyBefore + coinBase >= utils.blockchainSettings.maxSupply) {
            coinBase = utils.blockchainSettings.maxSupply - this.supplyBefore;
        }
        
        return coinBase;
    }
    #calculateFee() {
        // TODO - calculate the fee
        return 0;
    }
}

export class UTXO {
    constructor(TxID, index, amount, address) {
        this.TxID = TxID;
        this.index = index;
        this.amount = amount;
        this.address = address;
    }
}
class utxoInput {
    constructor(TxID, index, unlock = 'simpleSignature') {
        this.TxID = TxID;
        this.unlock = unlockScript;
        this.version = 1;
    }

    unlock = {
        transfert: {
            v1: (witness) => {
                const signatures = witness.signatures;
                const pubKeys = witness.pubKeys;
            }
        }
    }
}
class utxoOutput {
    constructor(amount = 0, addresses = [''], script = 'signatures', version = 1) {
        this.amount = amount;
        this.addresses = addresses;
        this.script = script;
        this.version = version;
        this.object = this.#createObject();
    }

    #createObject() {
        return {
            amount: this.amount,
            addresses: this.addresses,
            script: this.script,
            version: this.version
        };
    }
}

export class Transaction {
    constructor(inputs = [], outputs = []) {
        this.id = '';
        this.inputs = inputs;
        this.outputs = outputs;
        this.witnesses = []; // like segwit, we don't include the signatures in the transaction hash
    }

    /**
     * @param {string} address 
     * @param {number} amount
     */
    static async createCoinbaseTransaction(address, amount) {
        const coinbaseOutput = new utxoOutput(amount, address, 'signatures');
        const inputs = [];
        const outputs = [ coinbaseOutput.object ];

        return Transaction.createTransaction(inputs, outputs);
    }
    static createTransaction(inputs = [], outputs = []) {
        const tx = new Transaction(inputs, outputs);
        return tx.#hashTxIDAndReturnTransaction();
    }
    async #hashTxIDAndReturnTransaction() {
        const message = this.#getStringToHash();
        const id = await conCrypto.SHA256Hash(message);
        if (!id) { console.error('Failed to hash the transaction'); return false; }

        this.id = id;
        return this;
    }
    #getStringToHash() {
        const inputsStr = JSON.stringify(this.inputs);
        const outputsStr = JSON.stringify(this.outputs);
        return `${inputsStr}${outputsStr}`;
    }
}
export class Wallet {
    constructor(masterHex) {
        /** @type {string} */
        this.masterHex = masterHex; // 30 bytes - 60 chars
        /** @type {Object<string, Account[]>} */
        this.accounts = { // max accounts per type = 65536
            W: [],
            C: [],
            S: [],
            P: [],
            U: []
        };
    }

    static async restore(mnemonicHex = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") {
        const argon2HashResult = await conCrypto.argon2Hash(mnemonicHex, "Contrast's Salt Isnt Pepper But It Is Tasty", 27, 1024, 1, 2, 26);
        if (!argon2HashResult) { return false; }

        return new Wallet(argon2HashResult.hex);
    }
    async deriveAccounts(nbOfAccounts = 1, securityLevelPrefix = "C") {
        const nbOfExistingAccounts = this.accounts[securityLevelPrefix].length;
        const iterationsPerAccount = []; // used for control

        for (let i = nbOfExistingAccounts; i < nbOfAccounts; i++) {
            const { account, iterations } = await this.deriveAccount(i, securityLevelPrefix);
            if (!account) { console.error('deriveAccounts interrupted!'); return false; }

            iterationsPerAccount.push(iterations);
            this.accounts[securityLevelPrefix].push(account);
        }
        
        const derivedAccounts = this.accounts[securityLevelPrefix].slice(nbOfExistingAccounts);
        if (derivedAccounts.length !== nbOfAccounts) { console.error('Failed to derive all accounts'); return false; }
        return { derivedAccounts, avgIterations: iterationsPerAccount.reduce((a, b) => a + b, 0) / nbOfAccounts };
    }
    async deriveAccount(accountIndex = 0, securityLevelPrefix = "C") {
        const securityLevel = utils.addressSecurityLevelByPrefix[securityLevelPrefix];
        if (securityLevel === undefined) { console.error('Invalid security level prefix'); return false; }

        // To be sure we have enough iterations, but avoid infinite loop
        const maxIterations = 65536 * (2 ** securityLevel); // max with securityLevel: 65536 * (2^16) => 4 294 967 296
        const seedModifierStart = accountIndex * maxIterations; // max with accountIndex: 65535 * 4 294 967 296 => 281 470 681 743 360
        for (let i = 0; i < maxIterations; i++) {
            const seedModifier = seedModifierStart + i;
            const seedModifierHex = seedModifier.toString(16).padStart(12, '0'); // padStart(12, '0') => 48 bits (6 bytes), maxValue = 281 474 976 710 655
            const seedHex = this.masterHex + seedModifierHex;
            
            const keyPair = await conCrypto.generateKeyPairFromHash(seedHex);
            if (!keyPair) { console.error('Failed to generate key pair'); return false; }
            
            const addressBase58 = await conCrypto.deriveAddress(keyPair.pubKeyHex);
            if (!addressBase58) { console.error('Failed to derive address'); return false; }

            const { isConform, firstChar } = conCrypto.addressVerif.conformityCheck(addressBase58);
            if (isConform === false || firstChar !== securityLevelPrefix) { continue; }
            
            const { isConformToSecurityLevel } = conCrypto.addressVerif.securityCheck(addressBase58, keyPair.pubKeyHex);
            if (!isConformToSecurityLevel) { continue; }

            const account = new Account(keyPair.pubKeyHex, keyPair.privKeyHex, addressBase58);
            return { account, iterations: i };
        }

        return false;
    }
}
class Account {
     /** @type {string} */
    #privKey = '';

    constructor(pubKey = '', privKey = '', address = '') {
        /** @type {string} */
        this.pubKey = pubKey;
        /** @type {string} */
        this.address = address;
        /** @type {UTXO[]} */
        this.utxos = [];

        this.#privKey = privKey;
    }
}

export class FullNode {
    constructor(chain) {
        this.settings = utils.blockchainSettings;
        /** @type {Block[]} */
        this.chain = chain || [];
        /** @type {Block} */
        this.blockCandidate = null;
    }

    static load(saveBlocksData = true) {
        const chain = storage.loadBlockchainLocally();
        const node = new FullNode(chain);

        if (saveBlocksData) { 
            const blocksData = node.#getBlocksMiningData();
            storage.saveBlocksDataLocally(blocksData);
        }

        // TODO: Get the Txs from the mempool and add them
        // TODO: Verify the Txs
        const Txs = [];
        node.blockCandidate = node.#createBlockCandidate(Txs);

        return node;
    }
    async blockProposal(nonceHex = '',  hashTime = 0) {
        const result = { success: false, message: '' };

        if (typeof nonceHex !== 'string') { result.message = 'Invalid nonceHex'; return result; }
        if (typeof hashTime !== 'number') { result.message = 'Invalid hashTime'; return result; }

        const desiredNonceLen = conCrypto.argon2_POW_Params.hashLen * 8;
        const nonceBitsStr = utils.convert.hex.toBits(nonceHex).join('');
        if (nonceBitsStr.length !== desiredNonceLen) { result.message = 'Invalid nonce length'; return result; }

        this.blockCandidate.timestamp = hashTime;

        const { success, hashBitsString, hashHex, message } = await this.blockCandidate.calculateHash(nonceHex);
        if (!success) { result.message = message ? message : 'Invalid hash'; return result; }

        const { isValid, error, adjust } = conCrypto.verifyBlockHash(hashBitsString, this.blockCandidate.difficulty);
        if (!isValid) { result.message = error; return result; }

        this.blockCandidate.nonce = nonceHex;
        this.blockCandidate.hash = hashHex;
        
        return this.#confirmBlockCandidateAndSave();
    }
    // TODO: Fork management
    getAverageBlockTime() {
        /*const blocks = this.chain.slice(-this.settings.blocksBeforeAdjustment);
        const NbBlocks = blocks.length;
        let sum = 0;

        for (let i = 0; i < NbBlocks; i++) {
            sum += blocks[i].timestamp;
        }*/
        let NbBlocks = Math.min(this.chain.length, this.settings.blocksBeforeAdjustment);
        const olderBlock = this.chain[this.chain.length - NbBlocks];
        const newerBlock = this.chain[this.chain.length - 1];
        const sum = newerBlock.timestamp - olderBlock.timestamp

        return sum / (NbBlocks - 1);
    }
    // Private methods
    /** @returns {number} - New difficulty */
    #difficultyAdjustment(logs = true) {
        const blockIndex = this.chain[this.chain.length - 1].index;
        const difficulty = this.chain[this.chain.length - 1].difficulty;
        
        if (typeof difficulty !== 'number') { console.error('Invalid difficulty'); return 1; }
        if (difficulty < 1) { console.error('Invalid difficulty < 1'); return 1; }

        if (typeof blockIndex !== 'number') { console.error('Invalid blockIndex'); return difficulty; }
        if (blockIndex === 0) { return difficulty; }

        const modulus = blockIndex % this.settings.blocksBeforeAdjustment;
        if (modulus !== 0) { return difficulty; }

        const averageBlockTimeMS = this.getAverageBlockTime();
        const deviation = 1 - (averageBlockTimeMS / this.settings.targetBlockTime);
        const deviationPercentage = deviation * 100; // over zero = too fast / under zero = too slow

        if (logs) {
            console.log(`BlockIndex: ${blockIndex} | Average block time: ${Math.round(averageBlockTimeMS)}ms`);
            console.log(`Deviation: ${deviation.toFixed(4)} | Deviation percentage: ${deviationPercentage.toFixed(2)}%`);
        }

        const diffAdjustment = Math.floor(Math.abs(deviationPercentage) / this.settings.thresholdPerDiffIncrement);
        const capedDiffIncrement = Math.min(diffAdjustment, this.settings.maxDiffIncrementPerAdjustment);
        const diffIncrement = deviation > 0 ? capedDiffIncrement : -capedDiffIncrement;
        const newDifficulty = Math.max(difficulty + diffIncrement, 1); // cap at 1 minimum
        this.chain[this.chain.length - 1].difficulty = newDifficulty;

        if (logs) {
            const state = diffIncrement === 0 ? 'maintained' : diffIncrement > 0 ? 'increased' : 'decreased';
            console.log(`Difficulty ${state} ${state === 'maintained' ? 'at' : 'to'}: ${newDifficulty}`);
        }

        return newDifficulty;
    }
    #createBlockCandidate(Txs = []) {
        if (this.chain.length === 0) { return new Block(); }

        const lastBlock = this.chain[this.chain.length - 1];
        const difficulty = this.#difficultyAdjustment();

        return new Block(difficulty, Txs, lastBlock);
    }
    #confirmBlockCandidateAndSave() {
        const { success, message } = this.#saveBlock( this.blockCandidate );
        if (!success) { return { success, message }; }

        this.chain.push(this.blockCandidate);
        this.blockCandidate = this.#createBlockCandidate();

        return { success: true, message: 'Block saved' };
    }
    #saveBlocks(blockIndexStart, blockIndexEnd) {
        for (let i = blockIndexStart; i <= blockIndexEnd; i++) {
            const block = this.chain[i];
            const { success, message } = this.#saveBlock(block);
            if (!success) { return { success, message, blockIndex: i }; }
        }
        return { success: true, message: 'Blocks saved'};
    }
    /** @param {Block} block */
    #saveBlock(block) {
        return storage.saveBlockLocally(block);
    }
    #getBlocksMiningData() {
        const blocksData = [];

        for (let i = 0; i < this.chain.length; i++) {
            const block = this.chain[i];

            blocksData.push({ 
                blockIndex: block.index,
                coinbaseReward: block.coinBase,
                timestamp: block.timestamp,
                difficulty: block.difficulty,
                timeBetweenBlocks: i === 0 ? 0 : block.timestamp - this.chain[i - 1].timestamp
            });
        }

        return blocksData;
    }
}
export class LightNode {
    
}

export class Miner {
    /** @param {string} minerAddress */
    constructor(minerAddress) {
        this.minerAddress = minerAddress;
        /** @type {Block} */
        this.blockCandidate = null;
    }
    /**
     * @param {string} minerAddress
     * @param {Block} blockCandidate
     */
    static async load(minerAddress, blockCandidate) {
        const miner = new Miner(minerAddress);
        await miner.setBlockCandidate(blockCandidate);

        return miner;
    }
    /** @param {Block} blockCandidate */
    async setBlockCandidate(blockCandidate) {
        // TODO: need to validate block before setting it to avoid invalid mining

        const coinEarnByFinder = blockCandidate.coinBase + blockCandidate.fee;
        const coinbaseTx = await Transaction.createCoinbaseTransaction(this.minerAddress, coinEarnByFinder);
        if (!coinbaseTx) { console.error('Failed to create coinbase transaction'); return; }
        
        blockCandidate.Txs.unshift(coinbaseTx);
        this.blockCandidate = blockCandidate;

        return true;
    }
    /**
     * This function is used to mine a block
     * @param {Block} blockCandidate
     */
    async minePow() {
        const blockCandidate = this.blockCandidate;
        const hashTime = Date.now();
        const nonce = conCrypto.generateRandomNonce(conCrypto.argon2_POW_Params.hashLen);

        blockCandidate.timestamp = hashTime;
    
        const { success, hashBitsString, hashHex, message } = await this.blockCandidate.calculateHash(nonce.Hex);
        if (!success) { return { success: false, message: message ? message : 'Invalid hash' }; }

        const difficulty = blockCandidate.difficulty;
        const verifResult = conCrypto.verifyBlockHash(hashBitsString, difficulty);
        //if (verifResult.isValid) { console.log(`POW -> [index:${blockCandidate.index}] = ${hashBitsString.slice(0, Math.floor(difficulty / 16))} - ${verifResult.next5BitsInt} >= ${verifResult.adjust}`); }
        if (verifResult.isValid) { console.log(`POW -> [index:${blockCandidate.index}] = ${Math.floor(difficulty / 16)} - ${verifResult.adjust}`); }

        return { finder: this.minerAddress, hashTime, nonce: nonce.Hex, hashHex, isValid: verifResult.isValid };
    }
}