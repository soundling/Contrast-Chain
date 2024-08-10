import conCrypto from './conCrypto.mjs';
import storage from "./storage.mjs";
import utils from './utils.mjs';


export class Block {
    constructor(prevHash = 'ContrastGenesisBlock', index = 0, difficulty = 1, Txs = []) {
        // Proof of work dependent
        /** @type {number} */
        this.timestamp = 0;
        this.hash = '';
        this.nonce = '';

        /** @type {string} */
        this.prevHash = prevHash;
        /** @type {number} */
        this.index = index;
        /** @type {number} */
        this.difficulty = difficulty;
        /** @type {Transaction[]} */
        this.Txs = Txs;
    }

    setPowDependentValues(timestamp = 0, nonce = '', hashHex = '') {
        this.timestamp = timestamp;
        this.hash = hashHex;
        this.nonce = nonce;
    }
    resetPowDependentValues() {
        this.timestamp = 0;
        this.hash = '';
    }
    getBlockSignature() {
        const TxsStr = JSON.stringify(this.Txs);
        const signatureStr = `${this.prevHash}${this.timestamp}${this.index}${this.difficulty}${TxsStr}`;
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
            difficulty: this.difficulty,
            Txs: this.Txs
        };
    }
    getCoinbaseBlockReward() {
        const blockReward = utils.blockchainSettings.blockReward;
        const minBlockReward = utils.blockchainSettings.minBlockReward;
        const halvingInterval = utils.blockchainSettings.halvingInterval;
        const blockIndex = this.index;
        const halvings = Math.floor(blockIndex / halvingInterval);

        // Calculer la récompense actuelle en divisant la récompense initiale par 2, autant de fois qu'il y a eu de halvings
        const result = { success: true, message: '', blockReward: blockReward };
        for (let i = 0; i < halvings; i++) {
            result.blockReward /= 2;
            if (result.blockReward < minBlockReward) { 
                result.blockReward = minBlockReward;
                result.message = `Block reward reached minimum value: ${minBlockReward}`;
                break;
            }
        }

        if (!Number.isInteger(result.blockReward)) {
            result.success = false; result.message = 'Invalid blockReward not Integer';
        }
        return result;
    }
    getClone() {
        const prevHash = this.prevHash;
        const index = this.index;
        const difficulty = this.difficulty;
        const Txs = this.Txs;

        return new Block(prevHash, index, difficulty, Txs);
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
    constructor(TxID, index, unlockScript = 'simpleSignature') {
        this.TxID = TxID;
        this.index = index;
        this.unlockScript = unlockScript;
    }

    unlockScripts = {
        transfert: {
            v1: (signature, pubKey) => {

            }
        }
    }
}
class utxoOutput {
    constructor(amount = 0, address = '', lockScript = 'simpleSig', version = 1) {
        this.amount = amount;
        this.address = address;
        this.lockScript = lockScript;
        this.object = this.#createObject();
    }

    #createObject() {
        return {
            amount: this.amount,
            address: this.address,
            lockScript: this.lockScript
        };
    }

    static lockScripts = {
        simpleSig: {
            //v1: (address, signature, message, pubKey) => {
            v1: (pubKey) => {

            }
        }
    }
}

export class Transaction {
    constructor(inputs = [], outputs = []) {
        this.id = '';
        this.inputs = inputs;
        this.outputs = outputs;
    }

    /**
     * @param {string} address 
     * @param {number} blockReward
     */
    static async createCoinbaseTransaction(address, blockReward) {
        const coinbaseOutput = new utxoOutput(blockReward, address, 'simpleSig');

        const inputs = [];
        const outputs = [ coinbaseOutput.object ];

        const coinbaseTx = new Transaction(inputs, outputs);
        return coinbaseTx.hashTxIDAndReturnTransaction();
    }
    static createTransaction(inputs = [], outputs = []) {
    }
    async hashTxIDAndReturnTransaction() {
        const message = this.getStringToHash();
        const id = await conCrypto.SHA256Hash(message);
        if (!id) { console.error('Failed to hash the transaction'); return false; }

        this.id = id;
        return this;
    }
    getStringToHash() {
        const inputsStr = JSON.stringify(this.inputs);
        const outputsStr = JSON.stringify(this.outputs);
        return `${inputsStr}${outputsStr}`;
    }
}
export class Wallet {
    constructor(masterHex) {
        /** @type {string} */
        this.masterHex = masterHex; // 30 bytes - 60 chars
        /** @type {string[]} */
        this.addresses = [];
        /** @type {Account[]} */
        this.accounts = []; // max accounts = 65536
    }

    static async restore(mnemonicHex = "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF") {
        const argon2HashResult = await conCrypto.argon2Hash(mnemonicHex, "Contrast's Salt Isnt Pepper But It Is Tasty", 27, 1024, 1, 2, 28);
        if (!argon2HashResult) { return false; }

        return new Wallet(argon2HashResult.hex);
    }
    async deriveAccounts(nbOfAccounts = 1) {
        const nbOfExistingAccounts = this.accounts.length;
        let derivedAccounts = 0;

        for (let i = nbOfExistingAccounts; i < nbOfAccounts; i++) {
            const account = await this.deriveAccount(i);
            if (!account) { console.error('deriveAccounts interrupted!'); return false; }

            this.accounts.push(account);
            derivedAccounts++;
        }

        if (derivedAccounts !== nbOfAccounts) { console.error('Failed to derive all accounts'); return false; }
        return this.accounts.slice(nbOfExistingAccounts);
    }
    async deriveAccount(accountIndex = 0) {
        const maxIterations = 65536; // require 2 bytes
        const seedModifierStart = accountIndex * maxIterations;
        for (let i = 0; i < maxIterations; i++) {
            const seedModifier = seedModifierStart + i;
            const seedModifierHex = seedModifier.toString(16).padStart(8, '0');
            const seedHex = this.masterHex + seedModifierHex;

            const keyPair = await conCrypto.generateKeyPairFromHash(seedHex);
            if (!keyPair) { console.error('Failed to generate key pair'); return false; }

            const { isValidAddress, addressBase58, firstChar } = await conCrypto.deriveAddress(keyPair.pubKeyHex);
            if (isValidAddress) { 
                const account = new Account(keyPair.pubKeyHex, keyPair.privKeyHex, addressBase58);
                this.accounts.push(account);
                return account;
            }
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
        this.blockCandidate = new Block();
    }

    static load() {
        const chain = storage.loadBlockchainLocally();
        const node = new FullNode(chain);
        const blocksData = node.#getBlocksMiningData();
        storage.saveBlocksDataLocally(blocksData);

        node.blockCandidate = node.#createBlockCandidate();

        return node;
    }
    async blockProposal(nonceHex = '',  hashTime = 0) {
        const result = { success: false, message: '', newBlockCandidate: new Block() };

        if (typeof nonceHex !== 'string') { result.message = 'Invalid nonceHex'; return result; }
        if (typeof hashTime !== 'number') { result.message = 'Invalid hashTime'; return result; }

        const desiredNonceLen = conCrypto.argon2_POW_Params.hashLen * 8;
        const nonceBitsStr = utils.convert.hex.toBits(nonceHex).join('');
        if (nonceBitsStr.length !== desiredNonceLen) { result.message = 'Invalid nonce length'; return result; }

        this.blockCandidate.timestamp = hashTime;

        const { success, hashBitsString, hashHex, message } = await this.blockCandidate.calculateHash(nonceHex);
        if (!success) { result.message = message ? message : 'Invalid hash'; return result; }

        const { isValid, error } = conCrypto.verifyBlockHash(hashBitsString, this.blockCandidate.difficulty);
        if (!isValid) { result.message = error; return result; }

        this.blockCandidate.setPowDependentValues(hashTime, nonceHex, hashHex);
        
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
    #createBlockCandidate() {
        // TODO: Get the Txs from the mempool and add them
        // TODO: Verify the Txs
        const Txs = [];

        if (this.chain.length === 0) { return new Block() }

        const lastBlock = this.chain[this.chain.length - 1];
        const prevHash = lastBlock.hash;
        const blockIndex = lastBlock.index + 1;
        const difficultyAdjustment = this.#difficultyAdjustment();

        return new Block(prevHash, blockIndex, difficultyAdjustment, Txs);
    }
    #confirmBlockCandidateAndSave() {
        const cloneOfBlockCandidate = this.blockCandidate.getClone();

        this.chain.push(this.blockCandidate);

        const newBlockCandidate = this.#createBlockCandidate();
        this.blockCandidate = newBlockCandidate;
        
        const blockIndex = this.chain[this.chain.length - 1].index;
        const { success, message } = this.#saveBlock(blockIndex);
        if (!success) { 
            this.chain.pop();
            this.blockCandidate = cloneOfBlockCandidate;

            return {success, message, newBlockCandidate};
        }

        return { success: true, message: 'Block saved', newBlockCandidate };
    }
    #saveBlocks(blockIndexStart, blockIndexEnd) {
        for (let i = blockIndexStart; i <= blockIndexEnd; i++) {
            const { success, message } = this.#saveBlock(i);
            if (!success) { return { success, message, blockIndex: i }; }
        }
        return { success: true, message: 'Blocks saved'};
    }
    #saveBlock(blockIndex) {
        const block = this.chain[blockIndex];
        return storage.saveBlockLocally(block);
    }
    #getBlocksMiningData() {
        const blocksData = [];

        for (let i = 0; i < this.chain.length; i++) {
            const block = this.chain[i];
            const blockReward = block.getCoinbaseBlockReward();
            if (!blockReward.success) { console.error(`Failed to get block reward for block ${block.index}`); return false; }

            blocksData.push({ 
                blockIndex: block.index,
                blockReward: blockReward.blockReward,
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
    
    static async load(minerAddress, blockCandidate) {
        const miner = new Miner(minerAddress);
        await miner.setBlockCandidate(blockCandidate);

        return miner;
    }
    /** @param {Block} blockCandidate */
    async setBlockCandidate(blockCandidate) {
        // TODO: need to validate block before setting it to avoid invalid mining
        const blockCandidateCopy = blockCandidate.getClone();
        const blockReward = blockCandidate.getCoinbaseBlockReward();

        const coinbaseTx = await Transaction.createCoinbaseTransaction(this.minerAddress, blockReward);
        if (!coinbaseTx) { console.error('Failed to create coinbase transaction'); return; }
        
        blockCandidateCopy.Txs.unshift(coinbaseTx);

        this.blockCandidate = blockCandidateCopy;

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
        if (verifResult.isValid) { console.log(`POW -> [index:${blockCandidate.index}] = ${hashBitsString.slice(0, Math.floor(difficulty / 16))} - ${verifResult.next5BitsInt} >= ${verifResult.adjust}`); }
    
        return { finder: this.minerAddress, hashTime, nonce: nonce.Hex, hashHex, isValid: verifResult.isValid };
    }
}