/**
 * Transaction class for the Blue Carbon MRV system
 * Handles carbon credit transactions and restoration data
 */

import CryptoUtils from '../crypto/crypto-utils.js';

export class Transaction {
  constructor({
    id = null,
    type,
    from,
    to,
    amount = 0,
    data = {},
    timestamp = null,
    signature = null
  }) {
    this.id = id || CryptoUtils.generateId();
    this.type = type; // 'restoration', 'credit_mint', 'credit_transfer', 'validation'
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.data = data;
    this.timestamp = timestamp || CryptoUtils.getTimestamp();
    this.signature = signature;
  }

  /**
   * Create restoration data transaction
   * @param {Object} params - Restoration parameters
   * @returns {Transaction}
   */
  static createRestoration({
    organizationId,
    location,
    area,
    speciesData,
    images,
    timestamp
  }) {
    // Validate GPS coordinates
    if (!CryptoUtils.validateGPS(location.latitude, location.longitude)) {
      throw new Error('Invalid GPS coordinates');
    }

    const data = {
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || null
      },
      area: area, // in square meters
      speciesData: speciesData || [],
      images: images || [],
      verified: false,
      validations: []
    };

    return new Transaction({
      type: 'restoration',
      from: organizationId,
      to: 'network',
      data,
      timestamp
    });
  }

  /**
   * Create carbon credit minting transaction
   * @param {Object} params - Minting parameters
   * @returns {Transaction}
   */
  static createCreditMint({
    restorationTxId,
    credits,
    organizationId,
    carbonRate = 1
  }) {
    const data = {
      restorationTxId,
      carbonRate, // credits per square meter
      calculatedCredits: credits,
      status: 'pending'
    };

    return new Transaction({
      type: 'credit_mint',
      from: 'network',
      to: organizationId,
      amount: credits,
      data
    });
  }

  /**
   * Create validation transaction
   * @param {Object} params - Validation parameters
   * @returns {Transaction}
   */
  static createValidation({
    targetTxId,
    validatorId,
    approved,
    evidence = null
  }) {
    const data = {
      targetTxId,
      approved,
      evidence,
      validatorReputation: 1.0 // Could be dynamic based on validator history
    };

    return new Transaction({
      type: 'validation',
      from: validatorId,
      to: 'network',
      data
    });
  }

  /**
   * Create credit transfer transaction
   * @param {Object} params - Transfer parameters
   * @returns {Transaction}
   */
  static createCreditTransfer({
    from,
    to,
    amount,
    price = 0
  }) {
    const data = {
      price,
      marketRate: price / amount || 0
    };

    return new Transaction({
      type: 'credit_transfer',
      from,
      to,
      amount,
      data
    });
  }

  /**
   * Sign transaction with private key
   * @param {string} privateKey - Private key for signing
   */
  sign(privateKey) {
    const txData = JSON.stringify({
      id: this.id,
      type: this.type,
      from: this.from,
      to: this.to,
      amount: this.amount,
      data: this.data,
      timestamp: this.timestamp
    });
    
    this.signature = CryptoUtils.sign(txData, privateKey);
  }

  /**
   * Verify transaction signature
   * @param {string} publicKey - Public key for verification
   * @returns {boolean}
   */
  verify(publicKey) {
    if (!this.signature) {
      return false;
    }

    const txData = JSON.stringify({
      id: this.id,
      type: this.type,
      from: this.from,
      to: this.to,
      amount: this.amount,
      data: this.data,
      timestamp: this.timestamp
    });

    return CryptoUtils.verify(txData, this.signature, publicKey);
  }

  /**
   * Get transaction hash
   * @returns {string}
   */
  getHash() {
    const txData = JSON.stringify({
      id: this.id,
      type: this.type,
      from: this.from,
      to: this.to,
      amount: this.amount,
      data: this.data,
      timestamp: this.timestamp,
      signature: this.signature
    });
    
    return CryptoUtils.sha512(txData);
  }

  /**
   * Validate transaction structure and data
   * @returns {boolean}
   */
  isValid() {
    // Basic structure validation
    if (!this.id || !this.type || !this.from || !this.timestamp) {
      return false;
    }

    // Validate timestamp
    if (!CryptoUtils.validateTimestamp(this.timestamp, 60)) {
      return false;
    }

    // Type-specific validation
    switch (this.type) {
      case 'restoration':
        return this.validateRestorationData();
      case 'credit_mint':
        return this.validateCreditMintData();
      case 'validation':
        return this.validateValidationData();
      case 'credit_transfer':
        return this.validateTransferData();
      default:
        return false;
    }
  }

  /**
   * Validate restoration transaction data
   * @returns {boolean}
   */
  validateRestorationData() {
    if (!this.data.location || !this.data.area) {
      return false;
    }

    return CryptoUtils.validateGPS(
      this.data.location.latitude,
      this.data.location.longitude
    ) && this.data.area > 0;
  }

  /**
   * Validate credit mint transaction data
   * @returns {boolean}
   */
  validateCreditMintData() {
    return this.data.restorationTxId &&
           this.amount > 0 &&
           this.data.carbonRate > 0;
  }

  /**
   * Validate validation transaction data
   * @returns {boolean}
   */
  validateValidationData() {
    return this.data.targetTxId &&
           typeof this.data.approved === 'boolean';
  }

  /**
   * Validate transfer transaction data
   * @returns {boolean}
   */
  validateTransferData() {
    return this.to &&
           this.amount > 0;
  }

  /**
   * Convert transaction to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      from: this.from,
      to: this.to,
      amount: this.amount,
      data: this.data,
      timestamp: this.timestamp,
      signature: this.signature
    };
  }

  /**
   * Create transaction from JSON
   * @param {Object} json - Transaction JSON data
   * @returns {Transaction}
   */
  static fromJSON(json) {
    return new Transaction(json);
  }
}

export default Transaction;