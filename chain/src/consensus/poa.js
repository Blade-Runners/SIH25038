/**
 * Proof of Authority (PoA) Consensus mechanism for Blue Carbon MRV
 * Manages validator selection and block creation scheduling
 */

import CryptoUtils from '../crypto/crypto-utils.js';
import { getConfig } from '../config/config-loader.js';

export class ProofOfAuthority {
  constructor(blockchain) {
    this.blockchain = blockchain;
    this.config = getConfig();
    
    // Use config values with defaults
    this.blockInterval = 60000; // 1 minute block intervals
    
    this.currentRound = 0;
    this.isRunning = false;
    this.blockTimer = null;
    this.eventListeners = new Map();
  }

  /**
   * Start PoA consensus
   * @param {string} nodeId - This node's authority ID
   * @param {string} privateKey - This node's private key
   */
  start(nodeId, privateKey) {
    this.nodeId = nodeId;
    this.privateKey = privateKey;
    this.isRunning = true;

    console.log(`[PoA] Starting consensus for authority: ${nodeId}`);
    
    // Start block production timer
    this.scheduleNextBlock();
    
    this.emit('consensus_started', { nodeId });
  }

  /**
   * Stop PoA consensus
   */
  stop() {
    this.isRunning = false;
    
    if (this.blockTimer) {
      clearTimeout(this.blockTimer);
      this.blockTimer = null;
    }

    console.log(`[PoA] Stopping consensus for authority: ${this.nodeId}`);
    this.emit('consensus_stopped', { nodeId: this.nodeId });
  }

  /**
   * Schedule next block production
   */
  scheduleNextBlock() {
    if (!this.isRunning) return;

    // Calculate when this authority should produce next block
    const authorities = this.blockchain.getActiveAuthorities();
    if (authorities.length === 0) return;

    const authorityIndex = authorities.findIndex(auth => auth.id === this.nodeId);
    if (authorityIndex === -1) return;

    // Round-robin scheduling
    const currentRoundAuthority = authorities[this.currentRound % authorities.length];
    
    if (currentRoundAuthority.id === this.nodeId) {
      // This authority's turn - produce block immediately
      this.blockTimer = setTimeout(() => {
        this.produceBlock();
      }, 100);
    } else {
      // Wait for next round
      const timeToWait = this.blockInterval;
      this.blockTimer = setTimeout(() => {
        this.currentRound++;
        this.scheduleNextBlock();
      }, timeToWait);
    }
  }

  /**
   * Produce a new block
   */
  async produceBlock() {
    if (!this.isRunning) return;

    try {
      // Only produce block if we have pending transactions
      if (this.blockchain.pendingTransactions.length === 0) {
        // Log this message only occasionally to avoid flooding
        if (this.currentRound % 100 === 0) {
          console.log(`[PoA] No pending transactions, skipping block production (round ${this.currentRound})`);
        }
        this.advanceRound();
        return;
      }

      console.log(`[PoA] Authority ${this.nodeId} producing block #${this.blockchain.getChainLength()}`);

      // Mine pending transactions
      const block = this.blockchain.minePendingTransactions(this.nodeId, this.privateKey);
      
      console.log(`[PoA] Block #${block.index} produced with ${block.transactions.length} transactions`);
      
      // Emit block produced event
      this.emit('block_produced', {
        block: block.toJSON(),
        authority: this.nodeId,
        round: this.currentRound
      });

      // Advance to next round
      this.advanceRound();

    } catch (error) {
      console.error(`[PoA] Error producing block:`, error);
      this.advanceRound();
    }
  }

  /**
   * Advance to next consensus round
   */
  advanceRound() {
    this.currentRound++;
    this.scheduleNextBlock();
  }

  /**
   * Validate if authority can produce block
   * @param {string} authorityId - Authority ID
   * @param {number} blockIndex - Block index
   * @returns {boolean}
   */
  canAuthorityProduceBlock(authorityId, blockIndex) {
    const authorities = this.blockchain.getActiveAuthorities();
    if (authorities.length === 0) return false;

    const expectedAuthorityIndex = (blockIndex - 1) % authorities.length;
    const expectedAuthority = authorities[expectedAuthorityIndex];

    return expectedAuthority && expectedAuthority.id === authorityId;
  }

  /**
   * Validate block production timing
   * @param {Block} block - Block to validate
   * @param {Block} previousBlock - Previous block
   * @returns {boolean}
   */
  validateBlockTiming(block, previousBlock) {
    if (!previousBlock) return true; // Genesis block

    const timeDiff = new Date(block.timestamp) - new Date(previousBlock.timestamp);
    const minInterval = this.blockInterval * 0.5; // Allow 50% variance
    const maxInterval = this.blockInterval * 2.0; // Allow 200% variance

    return timeDiff >= minInterval && timeDiff <= maxInterval;
  }

  /**
   * Handle received block from network
   * @param {Object} blockData - Received block data
   * @returns {boolean} True if block was accepted
   */
  receiveBlock(blockData) {
    try {
      const block = Block.fromJSON(blockData);
      const latestBlock = this.blockchain.getLatestBlock();

      // Validate block structure and content
      if (!block.isValid(latestBlock)) {
        console.log(`[PoA] Received invalid block #${block.index}`);
        return false;
      }

      // Validate authority can produce this block
      if (!this.canAuthorityProduceBlock(block.authority, block.index)) {
        console.log(`[PoA] Authority ${block.authority} cannot produce block #${block.index}`);
        return false;
      }

      // Validate timing
      if (!this.validateBlockTiming(block, latestBlock)) {
        console.log(`[PoA] Block #${block.index} timing is invalid`);
        return false;
      }

      // Validate authority signature
      const authority = this.blockchain.authorities.get(block.authority);
      if (!authority || !block.verifySignature(authority.publicKey)) {
        console.log(`[PoA] Block #${block.index} signature is invalid`);
        return false;
      }

      // Check if this block extends the current chain
      if (block.index !== latestBlock.index + 1 || block.previousHash !== latestBlock.hash) {
        console.log(`[PoA] Block #${block.index} does not extend current chain`);
        return false;
      }

      // Add block to chain
      this.blockchain.chain.push(block);
      
      // Remove processed transactions from pending pool
      block.transactions.forEach(tx => {
        const index = this.blockchain.pendingTransactions.findIndex(pending => pending.id === tx.id);
        if (index > -1) {
          this.blockchain.pendingTransactions.splice(index, 1);
        }
      });

      console.log(`[PoA] Accepted block #${block.index} from authority ${block.authority}`);
      
      // Update consensus round
      this.currentRound = Math.max(this.currentRound, block.index);
      
      this.emit('block_accepted', {
        block: block.toJSON(),
        authority: block.authority
      });

      return true;

    } catch (error) {
      console.error(`[PoA] Error processing received block:`, error);
      return false;
    }
  }

  /**
   * Get consensus status
   * @returns {Object}
   */
  getStatus() {
    const authorities = this.blockchain.getActiveAuthorities();
    const currentAuthority = authorities[this.currentRound % authorities.length];

    return {
      isRunning: this.isRunning,
      nodeId: this.nodeId,
      currentRound: this.currentRound,
      totalAuthorities: authorities.length,
      currentAuthority: currentAuthority ? currentAuthority.id : null,
      isMyTurn: currentAuthority ? currentAuthority.id === this.nodeId : false,
      blockInterval: this.blockInterval,
      chainLength: this.blockchain.getChainLength()
    };
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[PoA] Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Get next block producer
   * @returns {Object|null}
   */
  getNextBlockProducer() {
    const authorities = this.blockchain.getActiveAuthorities();
    if (authorities.length === 0) return null;

    const nextRound = this.currentRound + 1;
    return authorities[nextRound % authorities.length];
  }

  /**
   * Estimate time to next block
   * @returns {number} Time in milliseconds
   */
  getTimeToNextBlock() {
    const authorities = this.blockchain.getActiveAuthorities();
    if (authorities.length === 0) return 0;

    const myIndex = authorities.findIndex(auth => auth.id === this.nodeId);
    if (myIndex === -1) return 0;

    const currentAuthorityIndex = this.currentRound % authorities.length;
    
    if (currentAuthorityIndex === myIndex) {
      return 100; // Almost immediate if it's our turn
    }

    // Calculate rounds until our turn
    let roundsToWait = myIndex - currentAuthorityIndex;
    if (roundsToWait <= 0) {
      roundsToWait += authorities.length;
    }

    return roundsToWait * this.blockInterval;
  }
}

export default ProofOfAuthority;
