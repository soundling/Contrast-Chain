import conCrypto from './conCrypto.mjs';
import { Wallet, Block, FullNode, LightNode, Miner } from './classes.mjs';
import utils from './utils.mjs';
import etc from './etc.mjs';

const contrast = {
    Wallet,
    Block,
    FullNode,
    LightNode,
    Miner,
    crypto: conCrypto,
    utils,
    etc
};

export default contrast;