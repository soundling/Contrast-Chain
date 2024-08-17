'use strict';
import { Transaction_Builder } from './src/classes.mjs';
import contrast from './src/contrast.mjs';
/**
* @typedef {import("./src/classes.mjs").Account} Account
*/

const testParams = {
    nbOfAccounts: 2,
    addressType: 'W',
    testTxEachNbBlock: 10
}

/** @param {Account[]} accounts */
async function nodeSpecificTest(accounts) {
    const minerAccount = accounts[0];
    const receiverAccount = accounts[1];

    if (!contrast.utils.isNode) { return; }
    // Offline Node
    const node = contrast.FullNode.load();
    if (!node) { console.error('Failed to load FullNode.'); return; }

    const miner = new contrast.Miner(minerAccount);
    if (!miner) { console.error('Failed to load Miner.'); return; }

    for (let i = 0; i < 1_000_000; i++) {
        if (node.blockCandidate.index !== 0 && node.blockCandidate.index % testParams.testTxEachNbBlock === 0) { // TRANSACTION TEST
            const UTXOsJSON = node.hotData.getUTXOsJSON(minerAccount.address); // should be provided by network
            minerAccount.setUTXOsFromJSON(UTXOsJSON);

            const { signedTxJSON, error } = await Transaction_Builder.createAndSignTransferTransaction(minerAccount, 10_000, receiverAccount.address);
            if (signedTxJSON) {
                console.log(`SEND: ${minerAccount.address} -> ${receiverAccount.address} 10_000`);
                console.log(`_________Pushing transaction_________ ${JSON.parse(signedTxJSON).id.slice(0, 12)}... to mempool.`);
                node.addTransactionJSONToMemPool(signedTxJSON);
            } else {
                console.log(error);
            }
        }

        try { // JUST MINING
            // like we receive a block from network
            const blockCandidateClone = contrast.Block.cloneBlockData(node.blockCandidate); 

            const { validBlockCandidate, nonceHex, hashTime, coinbaseTx } = await miner.minePow(blockCandidateClone);
            if (!validBlockCandidate) { throw new Error('Not valid nonce.'); }

            // verify the block as FullNode
            const blockProposalSucceed = await node.blockProposal(nonceHex, hashTime, coinbaseTx);
            if (!blockProposalSucceed) { throw new Error('Block proposal rejected.'); }
    
            if (validBlockCandidate.hash !== node.blockCandidate.prevHash) { throw new Error('Fatal error: Block proposal accepted but prevHash does not match.'); }
        } catch (error) {
            const errorIncludesPOWerror = error.message.includes('unlucky--'); // mining invalid nonce/hash
            const errorSkippingLog = ['Not valid nonce.'];
            if (errorIncludesPOWerror === false && errorSkippingLog.includes(error.message) === false) { console.error(error); }

            const errorRequieringReturn = [
                'Fatal error: Block proposal accepted but prevHash does not match.',
                'Block proposal rejected.'
            ];
            if (errorRequieringReturn.includes(error.message)) { return; }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Node test completed. - stop mining');
}
async function test() {
    const timings = { walletRestore: 0, deriveAccounts: 0, startTime: Date.now(), checkPoint: Date.now() };

    const wallet = await contrast.Wallet.restore("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00");
    if (!wallet) { console.error('Failed to restore wallet.'); return; }
    timings.walletRestore = Date.now() - timings.checkPoint; timings.checkPoint = Date.now();
    
    const { derivedAccounts, avgIterations } = await wallet.deriveAccounts(testParams.nbOfAccounts, testParams.addressType);
    if (!derivedAccounts) { console.error('Failed to derive addresses.'); return; }
    timings.deriveAccounts = Date.now() - timings.checkPoint; timings.checkPoint = Date.now();
    
    console.log('account0 address: ' + derivedAccounts[0].address);
    
    console.log(
`__Timings -----------------------
| -- walletRestore: ${timings.walletRestore}ms
| -- deriveAccounts(${testParams.nbOfAccounts}): ${timings.deriveAccounts}ms
| -- deriveAccountsAvg: ~${timings.deriveAccounts / testParams.nbOfAccounts}ms
| -- deriveAccountAvgIterations: ${avgIterations}
| -- total: ${Date.now() - timings.startTime}ms
---------------------------------`
    );

    nodeSpecificTest(derivedAccounts);
}; test();