'use strict';

const lock = {
    signatures: {
        v1: (witness) => {
            const signatures = witness.signatures;
            
        }
    }
}

const unlock = {
    signatures: {
        v1: ([addresses], witness) => {
            const pubKeys = witness.pubKeys;
            
        }
    }
}

class utxoInput {
    constructor(TxID, index, unlock = 'signatures', version = 1) {
        this.TxID = TxID;
        this.unlock = unlockScript;
        this.version = 1;
    }

    unlock = {
        signatures: {
            v1: ([addresses], witness) => {
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

    lock = {
        signatures: {
            v1: (witness) => {
                const signatures = witness.signatures;
                
            }
        }
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