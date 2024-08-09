import contrast from './scripts/contrast.mjs';

/** @param {string} minerAddress */
async function nodeSpecificTest(minerAddress) {
    if (!contrast.utils.isNode) { return; }
    // Offline Node
    const node = contrast.FullNode.load();
    if (!node) { console.error('Failed to load FullNode.'); return; }

    const miner = await contrast.Miner.load(minerAddress, node.blockCandidate);
    for (let i = 0; i < 100000; i++) {
        const powProposal = await miner.minePow();

        if (powProposal && powProposal.isValid) {
            // verify the block like a FullNode
            const { success, message, newBlockCandidate } = await node.blockProposal(powProposal.nonce, powProposal.hashTime);
            if (success) {
                if (powProposal.hashHex !== newBlockCandidate.prevHash) {
                    console.error('Fatal error: Block proposal accepted but prevHash does not match.');
                }
                // console.log('Block proposal accepted!');
                miner.setBlockCandidate(node.blockCandidate);
            } else {
                console.error('Block proposal rejected: ' + message);
            }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Node test completed. - stop mining');
}
async function test() {
    const nbOfAccounts = 2;
    const timings = { walletRestore: 0, deriveAccounts: 0, startTime: Date.now(), checkPoint: Date.now() };

    const wallet = await contrast.Wallet.restore();
    if (!wallet) { console.error('Failed to restore wallet.'); return; }
    timings.walletRestore = Date.now() - timings.checkPoint; timings.checkPoint = Date.now();
    
    const accounts = await wallet.deriveAccounts(nbOfAccounts);
    if (!accounts) { console.error('Failed to derive addresses.'); return; }
    timings.deriveAccounts = Date.now() - timings.checkPoint; timings.checkPoint = Date.now();
    
    console.log('account0:' + accounts[0].address);

    console.log(
`__Timings -----------------------
| -- walletRestore: ${timings.walletRestore}ms
| -- deriveAccounts(${nbOfAccounts}): ${timings.deriveAccounts}ms
| -- deriveAccountsAvg: ~${timings.deriveAccounts / nbOfAccounts}ms
| -- total: ${Date.now() - timings.startTime}ms
---------------------------------`
    );

    nodeSpecificTest(accounts[0].address);
}; test();