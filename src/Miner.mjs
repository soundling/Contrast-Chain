import utils from './utils.mjs';
import { BlockData, Block, Account, Transaction_Builder } from './index.mjs';


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