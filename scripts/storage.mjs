import etc from './etc.mjs';
import { Block } from "./classes.mjs";

const powDataPath = etc.path ? etc.path.join(etc.__dirname, 'powData') : null;
const blocksPath = etc.path ? etc.path.join(powDataPath, 'blocks') : null;
if (etc.path && !etc.fs.existsSync(powDataPath)) { etc.fs.mkdirSync(powDataPath); }
if (etc.path && !etc.fs.existsSync(blocksPath)) { etc.fs.mkdirSync(blocksPath); }

function getListOfFilesInBlocksDirectory() {
    if (etc.path) { 
        return etc.fs.readdirSync(blocksPath).filter(fileName => fileName.endsWith('.json'))
        .map(fileName => (
          parseInt(fileName.split('.')[0], 10)
        ))
        .sort((a, b) => a - b);
    }
    // TODO: Implement for browser - localStorage.setItem('blocks', JSON.stringify([]));
    // TODO: Implement for extension - chrome.storage.local.set({ blocks: [] });
}
function loadBlockchainLocally() {
    const blockFilesSorted = getListOfFilesInBlocksDirectory(); // be sure all files are here

    const chain = [];
    for (let i = 0; i < blockFilesSorted.length; i++) {
        const blockIndex = blockFilesSorted[i];
        if (i !== blockIndex) { throw new Error('Block index mismatch'); }

        const block = loadBlockLocally(blockIndex);
        chain.push(block);
    }

    return chain;
}
function loadBlockLocally(blockIndex = 0) {
    const blockIndexStr = blockIndex.toString();
    const blockFileName = `${blockIndexStr}.json`;
    const blockContent = etc.fs.readFileSync(etc.path.join(blocksPath, blockFileName), 'utf8');
    const blockContentObj = JSON.parse(blockContent);
    
    const block = new Block(blockContentObj.prevHash, blockContentObj.index, blockContentObj.difficulty, blockContentObj.Txs);
    block.setPowDependentValues(blockContentObj.timestamp, blockContentObj.nonce, blockContentObj.hash);
    return block;
}
/**
 * Save a block to the local storage
 * @param {Block} block - The block to save
 */
function saveBlockLocally(block) {
    const result = { success: true, message: 'Block ${blockContent.index} saved' };

    try {
        const blockContent = block.getBlockContent();
        etc.fs.writeFileSync(etc.path.join(blocksPath, `${blockContent.index}.json`), JSON.stringify(blockContent), 'utf8');
    } catch (error) {
        console.log(error.stack);
        /** @type {string} */
        result.message = error.message;
    }

    return result;
}

const storage = {
    loadBlockchainLocally,
    saveBlockLocally,
};

export default storage;