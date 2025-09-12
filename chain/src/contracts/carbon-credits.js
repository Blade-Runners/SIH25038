/**
 * Carbon Credits Smart Contract for Blue Carbon MRV system
 * Handles automatic minting, transfers, and carbon credit lifecycle
 */

import Transaction from '../blockchain/transaction.js';
import CryptoUtils from '../crypto/crypto-utils.js';

export class CarbonCreditsContract {
  constructor(blockchain) {
    this.blockchain = blockchain;
    this.contractAddress = 'carbon_credits_contract';
    this.creditRegistry = new Map(); // creditId -> credit details
    this.organizationCredits = new Map(); // organizationId -> [creditIds]
    this.transferHistory = new Map(); // creditId -> [transfer records]
    this.retiredCredits = new Set(); // Retired/used credit IDs
    
    // Carbon credit pricing and rates
    this.baseRate = 1.0; // Base credits per square meter
    this.speciesMultipliers = new Map([
      ['mangrove', 2.5],
      ['seagrass', 1.8],
      ['salt_marsh', 2.0],
      ['kelp_forest', 1.5],
      ['coral_reef', 3.0]
    ]);
    
    this.qualityMultipliers = new Map([
      ['high', 1.5],
      ['medium', 1.0],
      ['low', 0.7]
    ]);
  }

  /**
   * Process restoration transaction for automatic credit calculation
   * @param {Transaction} restorationTx - Restoration transaction
   * @returns {Object} Credit calculation result
   */
  calculateCreditsFromRestoration(restorationTx) {
    if (restorationTx.type !== 'restoration') {
      throw new Error('Invalid transaction type for credit calculation');
    }

    const data = restorationTx.data;
    const area = data.area; // in square meters
    
    // Calculate base credits
    let credits = area * this.baseRate;
    
    // Apply species multipliers
    if (data.speciesData && Array.isArray(data.speciesData)) {
      const speciesMultiplier = this.calculateSpeciesMultiplier(data.speciesData);
      credits *= speciesMultiplier;
    }
    
    // Apply quality multiplier based on data completeness and accuracy
    const qualityScore = this.assessDataQuality(data);
    const qualityMultiplier = this.qualityMultipliers.get(qualityScore) || 1.0;
    credits *= qualityMultiplier;
    
    // Round to 2 decimal places
    credits = Math.round(credits * 100) / 100;
    
    return {
      baseCredits: area * this.baseRate,
      speciesMultiplier: this.calculateSpeciesMultiplier(data.speciesData || []),
      qualityMultiplier,
      finalCredits: credits,
      calculation: {
        area,
        baseRate: this.baseRate,
        species: data.speciesData?.map(s => s.species) || [],
        quality: qualityScore
      }
    };
  }

  /**
   * Calculate species-based multiplier
   * @param {Array} speciesData - Array of species information
   * @returns {number} Multiplier value
   */
  calculateSpeciesMultiplier(speciesData) {
    if (!speciesData || speciesData.length === 0) {
      return 1.0;
    }

    let weightedMultiplier = 0;
    let totalCoverage = 0;

    speciesData.forEach(species => {
      const coverage = species.coverage || 1; // Default coverage if not specified
      const multiplier = this.speciesMultipliers.get(species.species) || 1.0;
      
      weightedMultiplier += multiplier * coverage;
      totalCoverage += coverage;
    });

    return totalCoverage > 0 ? weightedMultiplier / totalCoverage : 1.0;
  }

  /**
   * Assess data quality for multiplier calculation
   * @param {Object} data - Restoration data
   * @returns {string} Quality score: 'high', 'medium', 'low'
   */
  assessDataQuality(data) {
    let score = 0;
    
    // GPS accuracy
    if (data.location && data.location.accuracy) {
      if (data.location.accuracy <= 5) score += 2; // High accuracy
      else if (data.location.accuracy <= 15) score += 1; // Medium accuracy
    }
    
    // Images provided
    if (data.images && data.images.length >= 3) score += 2;
    else if (data.images && data.images.length > 0) score += 1;
    
    // Species data completeness
    if (data.speciesData && data.speciesData.length >= 2) score += 2;
    else if (data.speciesData && data.speciesData.length > 0) score += 1;
    
    // Area validation (reasonable size)
    if (data.area && data.area >= 100 && data.area <= 100000) score += 1;
    
    // Additional metadata
    if (data.methodology || data.baseline) score += 1;
    
    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  /**
   * Mint carbon credits after validation consensus
   * @param {string} restorationTxId - Restoration transaction ID
   * @param {string} organizationId - Organization receiving credits
   * @param {number} amount - Amount of credits to mint
   * @returns {string} Credit batch ID
   */
  mintCredits(restorationTxId, organizationId, amount) {
    const creditBatchId = CryptoUtils.generateId();
    const timestamp = CryptoUtils.getTimestamp();
    
    const creditBatch = {
      id: creditBatchId,
      restorationTxId,
      organizationId,
      amount,
      mintedAt: timestamp,
      status: 'active',
      vintage: new Date().getFullYear(), // Carbon credit vintage year
      methodology: 'blue_carbon_mrv_v1',
      serialNumber: this.generateSerialNumber(),
      metadata: {
        ecosystem: 'blue_carbon',
        verificationStandard: 'bcmrv_poa',
        additionalityProven: true
      }
    };
    
    // Register credit batch
    this.creditRegistry.set(creditBatchId, creditBatch);
    
    // Add to organization's credits
    if (!this.organizationCredits.has(organizationId)) {
      this.organizationCredits.set(organizationId, []);
    }
    this.organizationCredits.get(organizationId).push(creditBatchId);
    
    // Initialize transfer history
    this.transferHistory.set(creditBatchId, [{
      from: 'contract',
      to: organizationId,
      amount: amount,
      timestamp: timestamp,
      type: 'mint'
    }]);
    
    console.log(`[Contract] Minted ${amount} carbon credits (batch: ${creditBatchId}) for ${organizationId}`);
    
    return creditBatchId;
  }

  /**
   * Transfer carbon credits between organizations
   * @param {string} from - Sender organization ID
   * @param {string} to - Recipient organization ID
   * @param {number} amount - Amount to transfer
   * @param {number} price - Price per credit (optional)
   * @returns {string} Transfer transaction ID
   */
  transferCredits(from, to, amount, price = 0) {
    // Validate sender has sufficient credits
    const senderBalance = this.getCreditBalance(from);
    if (senderBalance < amount) {
      throw new Error(`Insufficient credits. Available: ${senderBalance}, Required: ${amount}`);
    }

    // Find credits to transfer (FIFO - oldest first)
    const transferCredits = this.selectCreditsForTransfer(from, amount);
    const transferId = CryptoUtils.generateId();
    const timestamp = CryptoUtils.getTimestamp();
    
    // Process each credit batch in the transfer
    transferCredits.forEach(({ creditBatchId, transferAmount }) => {
      const credit = this.creditRegistry.get(creditBatchId);
      
      if (transferAmount === credit.amount) {
        // Full batch transfer
        credit.organizationId = to;
        
        // Update organization mappings
        this.removeFromOrganization(from, creditBatchId);
        this.addToOrganization(to, creditBatchId);
        
      } else {
        // Partial batch transfer - split the batch
        const remainingAmount = credit.amount - transferAmount;
        const newBatchId = CryptoUtils.generateId();
        
        // Update original batch
        credit.amount = remainingAmount;
        
        // Create new batch for recipient
        const newBatch = {
          ...credit,
          id: newBatchId,
          organizationId: to,
          amount: transferAmount,
          parentBatch: creditBatchId
        };
        
        this.creditRegistry.set(newBatchId, newBatch);
        this.addToOrganization(to, newBatchId);
        this.transferHistory.set(newBatchId, [...this.transferHistory.get(creditBatchId)]);
      }
      
      // Record transfer in history
      this.addTransferRecord(creditBatchId, {
        transferId,
        from,
        to,
        amount: transferAmount,
        price,
        timestamp,
        type: 'transfer'
      });
    });
    
    console.log(`[Contract] Transferred ${amount} credits from ${from} to ${to}`);
    
    return transferId;
  }

  /**
   * Retire carbon credits (permanent removal from circulation)
   * @param {string} organizationId - Organization retiring credits
   * @param {number} amount - Amount to retire
   * @param {string} reason - Reason for retirement
   * @returns {string} Retirement transaction ID
   */
  retireCredits(organizationId, amount, reason = '') {
    const balance = this.getCreditBalance(organizationId);
    if (balance < amount) {
      throw new Error(`Insufficient credits for retirement. Available: ${balance}`);
    }

    const retireCredits = this.selectCreditsForTransfer(organizationId, amount);
    const retirementId = CryptoUtils.generateId();
    const timestamp = CryptoUtils.getTimestamp();
    
    retireCredits.forEach(({ creditBatchId, transferAmount }) => {
      const credit = this.creditRegistry.get(creditBatchId);
      
      if (transferAmount === credit.amount) {
        // Retire entire batch
        credit.status = 'retired';
        credit.retiredAt = timestamp;
        credit.retirementReason = reason;
        this.retiredCredits.add(creditBatchId);
        
      } else {
        // Partial retirement - split batch
        const remainingAmount = credit.amount - transferAmount;
        const retiredBatchId = CryptoUtils.generateId();
        
        // Update original batch
        credit.amount = remainingAmount;
        
        // Create retired batch
        const retiredBatch = {
          ...credit,
          id: retiredBatchId,
          amount: transferAmount,
          status: 'retired',
          retiredAt: timestamp,
          retirementReason: reason,
          parentBatch: creditBatchId
        };
        
        this.creditRegistry.set(retiredBatchId, retiredBatch);
        this.retiredCredits.add(retiredBatchId);
      }
      
      // Record retirement in history
      this.addTransferRecord(creditBatchId, {
        retirementId,
        from: organizationId,
        to: 'retired',
        amount: transferAmount,
        timestamp,
        type: 'retirement',
        reason
      });
    });
    
    console.log(`[Contract] Retired ${amount} credits for ${organizationId}. Reason: ${reason}`);
    
    return retirementId;
  }

  /**
   * Get carbon credit balance for organization
   * @param {string} organizationId - Organization ID
   * @returns {number} Total active credits
   */
  getCreditBalance(organizationId) {
    const creditIds = this.organizationCredits.get(organizationId) || [];
    let balance = 0;
    
    creditIds.forEach(creditId => {
      const credit = this.creditRegistry.get(creditId);
      if (credit && credit.status === 'active') {
        balance += credit.amount;
      }
    });
    
    return balance;
  }

  /**
   * Select credits for transfer using FIFO
   * @param {string} organizationId - Organization ID
   * @param {number} amount - Amount needed
   * @returns {Array} Array of {creditBatchId, transferAmount}
   */
  selectCreditsForTransfer(organizationId, amount) {
    const creditIds = this.organizationCredits.get(organizationId) || [];
    const selected = [];
    let remaining = amount;
    
    // Sort by minting date (FIFO)
    const sortedCredits = creditIds
      .map(id => this.creditRegistry.get(id))
      .filter(credit => credit && credit.status === 'active')
      .sort((a, b) => new Date(a.mintedAt) - new Date(b.mintedAt));
    
    for (const credit of sortedCredits) {
      if (remaining <= 0) break;
      
      const transferAmount = Math.min(remaining, credit.amount);
      selected.push({
        creditBatchId: credit.id,
        transferAmount
      });
      
      remaining -= transferAmount;
    }
    
    if (remaining > 0) {
      throw new Error('Insufficient credits available for transfer');
    }
    
    return selected;
  }

  /**
   * Helper methods for organization mappings
   */
  removeFromOrganization(organizationId, creditBatchId) {
    const credits = this.organizationCredits.get(organizationId) || [];
    const index = credits.indexOf(creditBatchId);
    if (index > -1) {
      credits.splice(index, 1);
    }
  }

  addToOrganization(organizationId, creditBatchId) {
    if (!this.organizationCredits.has(organizationId)) {
      this.organizationCredits.set(organizationId, []);
    }
    this.organizationCredits.get(organizationId).push(creditBatchId);
  }

  addTransferRecord(creditBatchId, record) {
    if (!this.transferHistory.has(creditBatchId)) {
      this.transferHistory.set(creditBatchId, []);
    }
    this.transferHistory.get(creditBatchId).push(record);
  }

  /**
   * Generate unique serial number for credit batch
   * @returns {string} Serial number
   */
  generateSerialNumber() {
    const year = new Date().getFullYear();
    const timestamp = Date.now();
    return `BC-${year}-${timestamp.toString(36).toUpperCase()}`;
  }

  /**
   * Get credit batch details
   * @param {string} creditBatchId - Credit batch ID
   * @returns {Object|null} Credit batch details
   */
  getCreditDetails(creditBatchId) {
    const credit = this.creditRegistry.get(creditBatchId);
    if (!credit) return null;
    
    return {
      ...credit,
      transferHistory: this.transferHistory.get(creditBatchId) || []
    };
  }

  /**
   * Get organization's credit portfolio
   * @param {string} organizationId - Organization ID
   * @returns {Object} Portfolio summary
   */
  getOrganizationPortfolio(organizationId) {
    const creditIds = this.organizationCredits.get(organizationId) || [];
    const activeCredits = [];
    const retiredCredits = [];
    let totalActive = 0;
    let totalRetired = 0;
    
    creditIds.forEach(creditId => {
      const credit = this.creditRegistry.get(creditId);
      if (credit) {
        if (credit.status === 'active') {
          activeCredits.push(credit);
          totalActive += credit.amount;
        } else if (credit.status === 'retired') {
          retiredCredits.push(credit);
          totalRetired += credit.amount;
        }
      }
    });
    
    // Also check for retired credits that were originally owned by this organization
    for (const [creditId, credit] of this.creditRegistry.entries()) {
      if (credit.status === 'retired' && credit.organizationId === organizationId && !creditIds.includes(creditId)) {
        retiredCredits.push(credit);
        totalRetired += credit.amount;
      }
    }
    
    return {
      organizationId,
      totalActive,
      totalRetired,
      totalMinted: totalActive + totalRetired,
      activeCredits,
      retiredCredits,
      vintageYears: [...new Set(activeCredits.map(c => c.vintage))].sort()
    };
  }

  /**
   * Get contract statistics
   * @returns {Object} Contract stats
   */
  getContractStats() {
    let totalMinted = 0;
    let totalActive = 0;
    let totalRetired = 0;
    const vintageYears = new Set();
    const ecosystems = new Map();
    
    for (const credit of this.creditRegistry.values()) {
      totalMinted += credit.amount;
      vintageYears.add(credit.vintage);
      
      if (credit.status === 'active') {
        totalActive += credit.amount;
      } else if (credit.status === 'retired') {
        totalRetired += credit.amount;
      }
      
      // Track ecosystem types
      const ecosystem = credit.metadata?.ecosystem || 'unknown';
      ecosystems.set(ecosystem, (ecosystems.get(ecosystem) || 0) + credit.amount);
    }
    
    return {
      totalMinted,
      totalActive,
      totalRetired,
      retirementRate: totalMinted > 0 ? totalRetired / totalMinted : 0,
      uniqueVintages: vintageYears.size,
      ecosystemBreakdown: Object.fromEntries(ecosystems),
      totalOrganizations: this.organizationCredits.size,
      totalBatches: this.creditRegistry.size
    };
  }
}

export default CarbonCreditsContract;