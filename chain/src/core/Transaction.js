import crypto from 'crypto';

export class Transaction {
  constructor(fromAddress, toAddress, amount, data = null) {
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data; 
    this.timestamp = Date.now();
    this.signature = null;
  }

  calculateHash() {
    return crypto
      .createHash('sha512')
      .update(
        this.fromAddress +
        this.toAddress +
        this.amount +
        this.timestamp +
        JSON.stringify(this.data)
      )
      .digest('hex');
  }

  signTransaction(signingKey) {
    if (signingKey.getPublic('hex') !== this.fromAddress) {
      throw new Error('You cannot sign transactions for other wallets!');
    }

    const hashTx = this.calculateHash();
    const sig = signingKey.sign(hashTx, 'base64');
    this.signature = sig.toDER('hex');
  }

  isValid() {
    if (this.fromAddress === null) return true;

    if (!this.signature || this.signature.length === 0) {
      throw new Error('No signature in this transaction');
    }

    try {
      const verify = crypto.createVerify('SHA512');
      verify.update(this.calculateHash());
      return verify.verify(this.fromAddress, this.signature, 'hex');
    } catch (error) {
      return false;
    }
  }

  static fromJSON(data) {
    const tx = new Transaction(data.fromAddress, data.toAddress, data.amount, data.data);
    tx.timestamp = data.timestamp;
    tx.signature = data.signature;
    return tx;
  }

  toJSON() {
    return {
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      amount: this.amount,
      data: this.data,
      timestamp: this.timestamp,
      signature: this.signature
    };
  }
}
