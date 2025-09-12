/**
 * Validation Pool for Blue Carbon MRV system
 * Manages transaction validation with UUID and peer consensus requirements
 */

import { writeFile, readFile, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import CryptoUtils from '../crypto/crypto-utils.js';
import DataSimilarity from '../utils/data-similarity.js';
import { getConfig } from '../config/config-loader.js';

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find project root directory by looking for package.json
function findProjectRoot(startDir) {
  let currentDir = startDir;
  while (currentDir !== dirname(currentDir)) {
    if (existsSync(join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }
  return startDir; // fallback to current directory
}

const projectRoot = findProjectRoot(__dirname);

export class ValidationPool {
  constructor(dataDir = null) {
    this.config = getConfig();
    this.dataDir = dataDir || join(projectRoot, 'data/val_pool');
    this.poolFile = join(this.dataDir, 'validation-pool.json');
    
    // Pool data structure
    this.pool = new Map(); // transactionId -> ValidationEntry
    this.registeredUUIDs = new Set();
    this.connectedPeers = new Set();
    this.dataSimilarity = new DataSimilarity();
    
    // Validation timeouts
    this.timeouts = new Map(); // transactionId -> timeout handle
    
    // Ensure directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.loadPool();
  }

  /**
   * Add a transaction to the validation pool
   * @param {Object} transaction - Transaction to validate
   * @param {string} submitterUuid - UUID of submitter
   * @param {string} peerAddress - Address of submitting peer
   * @returns {string} Transaction ID
   */
  async addTransaction(transaction, submitterUuid, peerAddress) {
    const config = await this.config.getAll();
    const transactionId = CryptoUtils.generateId();
    
    // Check if this UUID is privileged (skips validation)
    if (submitterUuid === config.privilegedUuid) {
      console.log(`[ValidationPool] Privileged UUID ${submitterUuid} - skipping validation`);
      return { transactionId, validated: true, skipValidation: true };
    }
    
    const validationEntry = {
      transactionId,
      transaction,
      firstSubmitter: submitterUuid,
      firstSubmitterPeer: peerAddress,
      submissions: new Map(), // uuid -> { data, peerAddress, timestamp }
      peerAddresses: new Set([peerAddress]),
      status: 'pending',
      created: new Date().toISOString(),
      timeout: Date.now() + (config.timeout * 1000)
    };
    
    // Add first submission
    validationEntry.submissions.set(submitterUuid, {
      data: transaction,
      peerAddress,
      timestamp: new Date().toISOString()
    });
    
    this.pool.set(transactionId, validationEntry);
    
    // Set timeout for auto-rejection
    this.timeouts.set(transactionId, setTimeout(() => {
      this.rejectTransaction(transactionId, 'timeout');
    }, config.timeout * 1000));
    
    console.log(`[ValidationPool] Added transaction ${transactionId} for validation`);
    
    // Check if validation criteria is already met
    this.checkValidation(transactionId);
    
    await this.savePool();
    
    return { transactionId, validated: false, skipValidation: false };
  }

  /**
   * Add a submission for existing transaction
   * @param {string} transactionId - Transaction ID
   * @param {Object} data - Submission data
   * @param {string} submitterUuid - UUID of submitter
   * @param {string} peerAddress - Address of submitting peer
   */
  async addSubmission(transactionId, data, submitterUuid, peerAddress) {
    const entry = this.pool.get(transactionId);
    if (!entry) {
      throw new Error(`Transaction ${transactionId} not found in validation pool`);
    }
    
    if (entry.status !== 'pending') {
      throw new Error(`Transaction ${transactionId} is no longer pending validation`);
    }
    
    // Add submission
    entry.submissions.set(submitterUuid, {
      data,
      peerAddress,
      timestamp: new Date().toISOString()
    });
    
    entry.peerAddresses.add(peerAddress);
    
    console.log(`[ValidationPool] Added submission for transaction ${transactionId} from UUID ${submitterUuid}`);
    
    // Check validation criteria
    this.checkValidation(transactionId);
    
    await this.savePool();
  }

  /**
   * Check if transaction meets validation criteria
   * @param {string} transactionId - Transaction ID
   */
  async checkValidation(transactionId) {
    const entry = this.pool.get(transactionId);
    if (!entry || entry.status !== 'pending') return;
    
    const config = await this.config.getAll();
    const submissions = Array.from(entry.submissions.values());
    
    // Group similar submissions
    const similarGroups = this.groupSimilarSubmissions(submissions);
    
    // Find the largest group of similar submissions
    let largestGroup = [];
    for (const group of similarGroups) {
      if (group.length > largestGroup.length) {
        largestGroup = group;
      }
    }
    
    // Check UUID validation threshold
    const requiredUuidCount = Math.ceil(this.registeredUUIDs.size * config.uuid_val_thres);
    const uuidCount = largestGroup.length;
    
    // Check peer validation threshold
    const requiredPeerCount = Math.ceil(this.connectedPeers.size * config.peer_val_thres);
    const uniquePeers = new Set(largestGroup.map(s => s.peerAddress));
    const peerCount = uniquePeers.size;
    
    console.log(`[ValidationPool] Transaction ${transactionId}: ${uuidCount}/${requiredUuidCount} UUIDs, ${peerCount}/${requiredPeerCount} peers`);
    
    // Check if validation criteria is met
    if (uuidCount >= requiredUuidCount && peerCount >= requiredPeerCount) {
      await this.approveTransaction(transactionId);
    }
  }

  /**
   * Group similar submissions using data similarity
   * @param {Array} submissions - Array of submissions
   * @returns {Array} Array of groups
   */
  groupSimilarSubmissions(submissions) {
    const config = this.config.getAll();
    const groups = [];
    
    for (const submission of submissions) {
      let addedToGroup = false;
      
      // Try to add to existing group
      for (const group of groups) {
        if (group.length > 0) {
          const similarity = this.dataSimilarity.compareSimilarity(
            submission.data,
            group[0].data
          );
          
          if (similarity >= config.sim_thres) {
            group.push(submission);
            addedToGroup = true;
            break;
          }
        }
      }
      
      // Create new group if not added
      if (!addedToGroup) {
        groups.push([submission]);
      }
    }
    
    return groups;
  }

  /**
   * Approve transaction
   * @param {string} transactionId - Transaction ID
   */
  async approveTransaction(transactionId) {
    const entry = this.pool.get(transactionId);
    if (!entry) return;
    
    entry.status = 'approved';
    entry.approvedAt = new Date().toISOString();
    
    // Clear timeout
    if (this.timeouts.has(transactionId)) {
      clearTimeout(this.timeouts.get(transactionId));
      this.timeouts.delete(transactionId);
    }
    
    console.log(`[ValidationPool] Transaction ${transactionId} approved - first submitter: ${entry.firstSubmitter}`);
    
    // Emit event for blockchain to process
    this.emit('transaction_approved', {
      transactionId,
      transaction: entry.transaction,
      firstSubmitter: entry.firstSubmitter
    });
    
    await this.savePool();
  }

  /**
   * Reject transaction
   * @param {string} transactionId - Transaction ID
   * @param {string} reason - Rejection reason
   */
  async rejectTransaction(transactionId, reason = 'validation_failed') {
    const entry = this.pool.get(transactionId);
    if (!entry) return;
    
    entry.status = 'rejected';
    entry.rejectedAt = new Date().toISOString();
    entry.rejectionReason = reason;
    
    // Clear timeout
    if (this.timeouts.has(transactionId)) {
      clearTimeout(this.timeouts.get(transactionId));
      this.timeouts.delete(transactionId);
    }
    
    console.log(`[ValidationPool] Transaction ${transactionId} rejected: ${reason}`);
    
    // Emit event
    this.emit('transaction_rejected', {
      transactionId,
      reason
    });
    
    await this.savePool();
  }

  /**
   * Update registered UUIDs
   * @param {Set} uuids - Set of registered UUIDs
   */
  updateRegisteredUUIDs(uuids) {
    this.registeredUUIDs = new Set(uuids);
    console.log(`[ValidationPool] Updated registered UUIDs: ${this.registeredUUIDs.size}`);
  }

  /**
   * Update connected peers
   * @param {Set} peers - Set of connected peer addresses
   */
  updateConnectedPeers(peers) {
    this.connectedPeers = new Set(peers);
    console.log(`[ValidationPool] Updated connected peers: ${this.connectedPeers.size}`);
  }

  /**
   * Get validation pool status
   * @returns {Object} Pool status
   */
  getStatus() {
    const pending = Array.from(this.pool.values()).filter(entry => entry.status === 'pending');
    const approved = Array.from(this.pool.values()).filter(entry => entry.status === 'approved');
    const rejected = Array.from(this.pool.values()).filter(entry => entry.status === 'rejected');
    
    return {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      total: this.pool.size,
      registeredUUIDs: this.registeredUUIDs.size,
      connectedPeers: this.connectedPeers.size
    };
  }

  /**
   * Save pool to disk
   */
  async savePool() {
    try {
      const poolData = {
        entries: Array.from(this.pool.entries()).map(([id, entry]) => [
          id,
          {
            ...entry,
            submissions: Array.from(entry.submissions.entries()),
            peerAddresses: Array.from(entry.peerAddresses)
          }
        ]),
        timestamp: new Date().toISOString()
      };
      
      await writeFileAsync(this.poolFile, JSON.stringify(poolData, null, 2));
    } catch (error) {
      console.error('[ValidationPool] Error saving pool:', error);
    }
  }

  /**
   * Load pool from disk
   */
  async loadPool() {
    try {
      if (existsSync(this.poolFile)) {
        const data = await readFileAsync(this.poolFile, 'utf8');
        const poolData = JSON.parse(data);
        
        this.pool = new Map(poolData.entries.map(([id, entry]) => [
          id,
          {
            ...entry,
            submissions: new Map(entry.submissions),
            peerAddresses: new Set(entry.peerAddresses)
          }
        ]));
        
        console.log(`[ValidationPool] Loaded ${this.pool.size} entries from storage`);
      }
    } catch (error) {
      console.error('[ValidationPool] Error loading pool:', error);
    }
  }

  /**
   * Event emitter functionality
   */
  emit(event, data) {
    // Simple event emitter for now
    console.log(`[ValidationPool] Event: ${event}`, data);
  }

  /**
   * Clean up expired transactions
   */
  async cleanup() {
    const now = Date.now();
    const expired = [];
    
    for (const [transactionId, entry] of this.pool.entries()) {
      if (entry.status === 'pending' && now > entry.timeout) {
        expired.push(transactionId);
      }
    }
    
    for (const transactionId of expired) {
      await this.rejectTransaction(transactionId, 'timeout');
    }
    
    if (expired.length > 0) {
      console.log(`[ValidationPool] Cleaned up ${expired.length} expired transactions`);
    }
  }
}

export default ValidationPool;