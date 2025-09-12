/**
 * Block class for the Blue Carbon MRV blockchain
 * Handles block structure and validation
 */

import CryptoUtils from '../crypto/crypto-utils.js';

export class Block {
  constructor({
    index,
    timestamp = null,
    transactions = [],
    previousHash,
    authority = null,
    signature = null,
    nonce = 0
  }) {
    this.index = index;
    this.timestamp = timestamp || CryptoUtils.getTimestamp();
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.authority = authority; // PoA validator who created this block
    this.signature = signature;
    this.nonce = nonce;
    this.merkleRoot = this.calculateMerkleRoot();
    this.hash = this.calculateHash();
  }

  /**
   * Calculate merkle root of all transactions in block
   * @returns {string}
   */
  calculateMerkleRoot() {
    if (this.transactions.length === 0) {
      return CryptoUtils.sha512('');
    }

    const txHashes = this.transactions.map(tx => 
      typeof tx.getHash === 'function' ? tx.getHash() : CryptoUtils.sha512(JSON.stringify(tx))
    );
    
    return CryptoUtils.getMerkleRoot(txHashes);
  }

  /**
   * Calculate block hash
   * @returns {string}
   */
  calculateHash() {
    const blockData = JSON.stringify({
      index: this.index,
      timestamp: this.timestamp,
      previousHash: this.previousHash,
      merkleRoot: this.merkleRoot,
      authority: this.authority,
      nonce: this.nonce
    });
    
    return CryptoUtils.sha512(blockData);
  }

  /**
   * Sign block with authority's private key
   * @param {string} privateKey - Authority's private key
   */
  sign(privateKey) {
    this.hash = this.calculateHash();
    this.signature = CryptoUtils.sign(this.hash, privateKey);
  }

  /**
   * Verify block signature
   * @param {string} publicKey - Authority's public key
   * @returns {boolean}
   */
  verifySignature(publicKey) {
    if (!this.signature || !this.authority) {
      return false;
    }
    
    return CryptoUtils.verify(this.hash, this.signature, publicKey);
  }

  /**
   * Validate block structure and content
   * @param {Block} previousBlock - Previous block in chain
   * @returns {boolean}
   */
  isValid(previousBlock = null) {
    // Validate basic structure
    if (!this.validateStructure()) {
      return false;
    }

    // Validate hash consistency
    if (this.hash !== this.calculateHash()) {
      return false;
    }

    // Validate merkle root
    if (this.merkleRoot !== this.calculateMerkleRoot()) {
      return false;
    }

    // Validate previous hash link
    if (previousBlock && this.previousHash !== previousBlock.hash) {
      return false;
    }

    // Validate all transactions
    for (const tx of this.transactions) {
      if (typeof tx.isValid === 'function' && !tx.isValid()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate block structure
   * @returns {boolean}
   */
  validateStructure() {
    return (
      typeof this.index === 'number' &&
      this.index >= 0 &&
      this.timestamp &&
      this.hash &&
      this.merkleRoot &&
      Array.isArray(this.transactions) &&
      (this.index === 0 || this.previousHash) // Genesis block has no previous hash
    );
  }

  /**
   * Get block size in bytes (approximate)
   * @returns {number}
   */
  getSize() {
    return JSON.stringify(this.toJSON()).length;
  }

  /**
   * Add transaction to block
   * @param {Transaction} transaction - Transaction to add
   */
  addTransaction(transaction) {
    if (typeof transaction.isValid === 'function' && transaction.isValid()) {
      this.transactions.push(transaction);
      this.merkleRoot = this.calculateMerkleRoot();
      this.hash = this.calculateHash();
    } else {
      throw new Error('Invalid transaction cannot be added to block');
    }
  }

  /**
   * Get transactions by type
   * @param {string} type - Transaction type
   * @returns {Array}
   */
  getTransactionsByType(type) {
    return this.transactions.filter(tx => tx.type === type);
  }

  /**
   * Get restoration transactions
   * @returns {Array}
   */
  getRestorationTransactions() {
    return this.getTransactionsByType('restoration');
  }

  /**
   * Get validation transactions
   * @returns {Array}
   */
  getValidationTransactions() {
    return this.getTransactionsByType('validation');
  }

  /**
   * Get carbon credit transactions
   * @returns {Array}
   */
  getCreditTransactions() {
    return this.getTransactionsByType('credit_mint')
      .concat(this.getTransactionsByType('credit_transfer'));
  }

  /**
   * Create genesis block
   * @param {string} authority - Genesis authority identifier
   * @returns {Block}
   */
  static createGenesis(authority = 'genesis') {
    return new Block({
      index: 0,
      timestamp: CryptoUtils.getTimestamp(),
      transactions: [],
      previousHash: '0',
      authority
    });
  }

  /**
   * Convert block to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions.map(tx => 
        typeof tx.toJSON === 'function' ? tx.toJSON() : tx
      ),
      previousHash: this.previousHash,
      authority: this.authority,
      signature: this.signature,
      nonce: this.nonce,
      merkleRoot: this.merkleRoot,
      hash: this.hash
    };
  }

  /**
   * Create block from JSON
   * @param {Object} json - Block JSON data
   * @returns {Block}
   */
  static fromJSON(json) {
    const block = new Block({
      index: json.index,
      timestamp: json.timestamp,
      transactions: json.transactions,
      previousHash: json.previousHash,
      authority: json.authority,
      signature: json.signature,
      nonce: json.nonce
    });
    
    // Restore calculated values
    block.merkleRoot = json.merkleRoot;
    block.hash = json.hash;
    
    return block;
  }
}

export default Block;