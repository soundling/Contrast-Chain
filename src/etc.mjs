'use strict';
import utils from './utils.mjs';

// Node specific imports
const fs = utils.isNode ? await import('fs') : null;
const path = utils.isNode ? await import('path') : null;
const url = utils.isNode ? await import('url') : null;
const fileURLToPath = url && url.fileURLToPath ? url.fileURLToPath : null;
const __filename = utils.isNode ? fileURLToPath(import.meta.url) : null;
const parentFolder = utils.isNode ? path.dirname(__filename) : null;
const __dirname = parentFolder ? path.dirname(parentFolder) : null;

const etc = {
    fs,
    path,
    __dirname,
};

export default etc;