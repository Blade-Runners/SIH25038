/**
 * Blockchain class for the Blue Carbon MRV system
 * Manages the complete blockchain with PoA consensus
 */

import Block from './block.js';
import Transaction from './transaction.js';
import CryptoUtils from '../crypto/crypto-utils.js';
import { getConfig } from '../config/config-loader.js';

export class Blockchain {
  constructor() {
    this.config = getConfig();
    
    this.chain = [];
    this.pendingTransactions = [];
    this.authorities = new Map(); // PoA validators: id -> {publicKey, reputation, isActive}
    
    // Use config values with defaults
    this.validationThreshold = 0.67;
    this.blockTime = 60000;
    this.maxBlockSize = 1048576;
    
    this.creditBalances = new Map(); // Track carbon credit balances
    this.restorationData = new Map(); // Track restoration projects
    this.validationQueue = new Map(); // Track pending validations
    
    // Create genesis block
    this.createGenesisBlock();
  }

  /**
   * Create genesis block
   */
  createGenesisBlock() {
    const genesis = Block.createGenesis();
    this.chain.push(genesis);
  }

  /**
   * Get latest block
   * @returns {Block}
   */
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  /**
   * Get chain length
   * @returns {number}
   */
  getChainLength() {
    return this.chain.length;
  }

  /**
   * Add authority to PoA consensus
   * @param {string} authorityId - Authority identifier
   * @param {string} publicKey - Authority's public key
   */
  addAuthority(authorityId, publicKey) {
    this.authorities.set(authorityId, {
      publicKey,
      reputation: 1.0,
      isActive: true,
      blocksCreated: 0
    });
  }

  /**
   * Remove authority from PoA consensus
   * @param {string} authorityId - Authority identifier
   */
  removeAuthority(authorityId) {
    if (this.authorities.has(authorityId)) {
      const authority = this.authorities.get(authorityId);
      authority.isActive = false;
    }
  }

  /**
   * Get active authorities
   * @returns {Array}
   */
  getActiveAuthorities() {
    return Array.from(this.authorities.entries())
      .filter(([_, auth]) => auth.isActive)
      .map(([id, auth]) => ({ id, ...auth }));
  }

  /**
   * Add transaction to pending pool
   * @param {Transaction} transaction - Transaction to add
   */
  addTransaction(transaction) {
    if (!transaction.isValid()) {
      throw new Error('Invalid transaction');
    }

    // Check for duplicate transactions
    const exists = this.pendingTransactions.some(tx => tx.id === transaction.id) ||
                   this.chain.some(block => 
                     block.transactions.some(tx => tx.id === transaction.id)
                   );

    if (exists) {
      throw new Error('Transaction already exists');
    }

    this.pendingTransactions.push(transaction);

    // Handle special transaction types
    this.processSpecialTransaction(transaction);
  }

  /**
   * Process special transaction types
   * @param {Transaction} transaction - Transaction to process
   */
  processSpecialTransaction(transaction) {
    switch (transaction.type) {
      case 'restoration':
        this.restorationData.set(transaction.id, {
          ...transaction.data,
          organizationId: transaction.from,
          status: 'pending_validation',
          validations: []
        });
        break;

      case 'validation':
        this.processValidation(transaction);
        break;

      case 'credit_mint':
        // Will be processed after validation consensus
        break;
    }
  }

  /**
   * Process validation transaction
   * @param {Transaction} validationTx - Validation transaction
   */
  processValidation(validationTx) {
    const targetId = validationTx.data.targetTxId;
    
    if (!this.validationQueue.has(targetId)) {
      this.validationQueue.set(targetId, {
        validations: [],
        totalValidators: this.getActiveAuthorities().length
      });
    }

    const validation = this.validationQueue.get(targetId);
    validation.validations.push({
      validatorId: validationTx.from,
      approved: validationTx.data.approved,
      timestamp: validationTx.timestamp
    });

    // Check if we have enough validations
    this.checkValidationConsensus(targetId);
  }

  /**
   * Check validation consensus (67% approval required)
   * @param {string} targetTxId - Target transaction ID
   */
  checkValidationConsensus(targetTxId) {
    const validation = this.validationQueue.get(targetTxId);
    if (!validation) return;

    const totalValidators = validation.totalValidators;
    const currentValidations = validation.validations.length;
    const approvals = validation.validations.filter(v => v.approved).length;

    // Need at least 67% of total validators to respond
    const minValidators = Math.ceil(totalValidators * this.validationThreshold);
    
    if (currentValidations >= minValidators) {
      const approvalRate = approvals / currentValidations;
      
      if (approvalRate >= this.validationThreshold) {
        // Consensus reached - approve and mint credits
        this.processApprovedRestoration(targetTxId);
      } else {
        // Consensus reached - reject
        this.processRejectedRestoration(targetTxId);
      }
      
      this.validationQueue.delete(targetTxId);
    }
  }

  /**
   * Process approved restoration and mint credits
   * @param {string} restorationTxId - Restoration transaction ID
   */
  processApprovedRestoration(restorationTxId) {
    const restoration = this.restorationData.get(restorationTxId);
    if (!restoration) return;

    // Calculate carbon credits based on area (1 credit per square meter as default)
    const credits = Math.floor(restoration.area * (restoration.carbonRate || 1));
    
    // Create credit minting transaction
    const mintTx = Transaction.createCreditMint({
      restorationTxId,
      credits,
      organizationId: restoration.organizationId
    });

    this.addTransaction(mintTx);
    
    // Update balances
    const currentBalance = this.creditBalances.get(restoration.organizationId) || 0;
    this.creditBalances.set(restoration.organizationId, currentBalance + credits);

    // Update restoration status
    restoration.status = 'approved';
    restoration.creditsMinted = credits;
  }

  /**
   * Process rejected restoration
   * @param {string} restorationTxId - Restoration transaction ID
   */
  processRejectedRestoration(restorationTxId) {
    const restoration = this.restorationData.get(restorationTxId);
    if (restoration) {
      restoration.status = 'rejected';
    }
  }

  /**
   * Mine pending transactions into a new block
   * @param {string} authorityId - Authority creating the block
   * @param {string} privateKey - Authority's private key
   * @returns {Block}
   */
  minePendingTransactions(authorityId, privateKey) {
    if (!this.authorities.has(authorityId) || !this.authorities.get(authorityId).isActive) {
      throw new Error('Invalid or inactive authority');
    }

    // Select transactions for the block (respecting size limits)
    const selectedTransactions = this.selectTransactionsForBlock();
    
    const block = new Block({
      index: this.chain.length,
      timestamp: CryptoUtils.getTimestamp(),
      transactions: selectedTransactions,
      previousHash: this.getLatestBlock().hash,
      authority: authorityId
    });

    // Sign the block
    block.sign(privateKey);

    // Add to chain
    this.chain.push(block);

    // Remove processed transactions from pending pool
    selectedTransactions.forEach(tx => {
      const index = this.pendingTransactions.findIndex(pending => pending.id === tx.id);
      if (index > -1) {
        this.pendingTransactions.splice(index, 1);
      }
    });

    // Update authority stats
    const authority = this.authorities.get(authorityId);
    authority.blocksCreated++;

    return block;
  }

  /**
   * Select transactions for block (with size limits)
   * @returns {Array}
   */
  selectTransactionsForBlock() {
    const selected = [];
    let currentSize = 0;

    for (const tx of this.pendingTransactions) {
      const txSize = JSON.stringify(tx.toJSON()).length;
      
      if (currentSize + txSize <= this.maxBlockSize) {
        selected.push(tx);
        currentSize += txSize;
      }
    }

    return selected;
  }

  /**
   * Validate entire blockchain
   * @returns {boolean}
   */
  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!currentBlock.isValid(previousBlock)) {
        return false;
      }

      // Verify authority signature
      if (currentBlock.authority && this.authorities.has(currentBlock.authority)) {
        const authority = this.authorities.get(currentBlock.authority);
        if (!currentBlock.verifySignature(authority.publicKey)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get carbon credit balance for organization
   * @param {string} organizationId - Organization identifier
   * @returns {number}
   */
  getCreditBalance(organizationId) {
    return this.creditBalances.get(organizationId) || 0;
  }

  /**
   * Get restoration project status
   * @param {string} restorationId - Restoration project ID
   * @returns {Object}
   */
  getRestorationStatus(restorationId) {
    return this.restorationData.get(restorationId) || null;
  }

  /**
   * Get blockchain statistics
   * @returns {Object}
   */
  getStats() {
    const totalTransactions = this.chain.reduce((sum, block) => sum + block.transactions.length, 0);
    const totalCredits = Array.from(this.creditBalances.values()).reduce((sum, balance) => sum + balance, 0);
    const totalRestorations = this.restorationData.size;

    return {
      blocks: this.chain.length,
      transactions: totalTransactions,
      pendingTransactions: this.pendingTransactions.length,
      authorities: this.getActiveAuthorities().length,
      totalCredits,
      totalRestorations,
      chainSize: this.chain.reduce((sum, block) => sum + block.getSize(), 0)
    };
  }

  /**
   * Convert blockchain to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      chain: this.chain.map(block => block.toJSON()),
      authorities: Array.from(this.authorities.entries()),
      creditBalances: Array.from(this.creditBalances.entries()),
      restorationData: Array.from(this.restorationData.entries()),
      pendingTransactions: this.pendingTransactions.map(tx => tx.toJSON())
    };
  }

  /**
   * Load blockchain from JSON
   * @param {Object} json - Blockchain JSON data
   */
  loadFromJSON(json) {
    this.chain = json.chain.map(blockData => Block.fromJSON(blockData));
    this.authorities = new Map(json.authorities);
    this.creditBalances = new Map(json.creditBalances);
    this.restorationData = new Map(json.restorationData);
    this.pendingTransactions = json.pendingTransactions.map(txData => Transaction.fromJSON(txData));
  }
}

export default Blockchain;