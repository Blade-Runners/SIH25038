import crypto from 'crypto';

export class Block {
  constructor(index, previousHash, timestamp, transactions, nonce = 0) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.nonce = nonce;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash('sha512')
      .update(
        this.index +
        this.previousHash +
        this.timestamp +
        JSON.stringify(this.transactions) +
        this.nonce
      )
      .digest('hex');
  }

  mineBlock(difficulty) {
    const target = Array(difficulty + 1).join('0');
    
    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.calculateHash();
    }

    console.log(`Block mined: ${this.hash}`);
  }

  hasValidTransactions() {
    for (const tx of this.transactions) {
      if (!tx.isValid()) {
        return false;
      }
    }
    return true;
  }

  static fromJSON(data) {
    const block = new Block(
      data.index,
      data.previousHash,
      data.timestamp,
      data.transactions,
      data.nonce
    );
    block.hash = data.hash;
    return block;
  }

  toJSON() {
    return {
      index: this.index,
      previousHash: this.previousHash,
      timestamp: this.timestamp,
      transactions: this.transactions,
      nonce: this.nonce,
      hash: this.hash
    };
  }
}