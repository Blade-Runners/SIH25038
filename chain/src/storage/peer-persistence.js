/**
 * Peer Persistence Manager for Blue Carbon MRV system
 * Manages peer identity persistence across restarts
 */

import { readFile, writeFile, existsSync, mkdirSync } from 'fs';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import CryptoUtils from '../crypto/crypto-utils.js';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

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

export class PeerPersistence {
  constructor(dataDir = null) {
    this.dataDir = dataDir || join(projectRoot, 'data/peer');
    this.peerInfoFile = join(this.dataDir, 'peer-info.json');
    this.peerInfo = null;
    
    // Ensure directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get or create peer identity
   * @returns {Promise<Object>} Peer information
   */
  async getPeerInfo() {
    if (this.peerInfo) {
      return this.peerInfo;
    }

    try {
      // Try to load existing peer info
      if (existsSync(this.peerInfoFile)) {
        const data = await readFileAsync(this.peerInfoFile, 'utf8');
        this.peerInfo = JSON.parse(data);
        
        // Validate peer info structure
        if (this.peerInfo.id && this.peerInfo.privateKey && this.peerInfo.publicKey) {
          console.log(`[PeerPersistence] Loaded existing peer identity: ${this.peerInfo.id}`);
          return this.peerInfo;
        }
      }
    } catch (error) {
      console.warn(`[PeerPersistence] Error loading peer info: ${error.message}`);
    }

    // Create new peer identity
    console.log('[PeerPersistence] Creating new peer identity');
    this.peerInfo = await this.createNewPeerInfo();
    await this.savePeerInfo();
    
    return this.peerInfo;
  }

  /**
   * Create new peer information
   * @returns {Promise<Object>} New peer info
   */
  async createNewPeerInfo() {
    const keyPair = await CryptoUtils.generateX448KeyPair();
    const id = CryptoUtils.generateId();
    
    return {
      id,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      created: new Date().toISOString(),
      networkInfo: this.getNetworkInfo()
    };
  }

  /**
   * Save peer information to disk
   * @returns {Promise<void>}
   */
  async savePeerInfo() {
    if (!this.peerInfo) {
      throw new Error('No peer info to save');
    }

    try {
      const data = JSON.stringify(this.peerInfo, null, 2);
      await writeFileAsync(this.peerInfoFile, data, 'utf8');
      console.log(`[PeerPersistence] Saved peer info: ${this.peerInfo.id}`);
    } catch (error) {
      console.error(`[PeerPersistence] Error saving peer info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get network interface information
   * @returns {Object} Network info
   */
  getNetworkInfo() {
    const interfaces = networkInterfaces();
    const networkInfo = {};

    for (const [name, configs] of Object.entries(interfaces)) {
      if (configs) {
        for (const config of configs) {
          if (config.family === 'IPv4' && !config.internal) {
            networkInfo[name] = {
              address: config.address,
              netmask: config.netmask,
              mac: config.mac
            };
          }
        }
      }
    }

    return networkInfo;
  }

  /**
   * Update peer info with new data
   * @param {Object} updates - Updates to apply
   * @returns {Promise<void>}
   */
  async updatePeerInfo(updates) {
    if (!this.peerInfo) {
      await this.getPeerInfo();
    }

    this.peerInfo = { ...this.peerInfo, ...updates };
    await this.savePeerInfo();
  }

  /**
   * Get peer ID
   * @returns {Promise<string>} Peer ID
   */
  async getPeerId() {
    const info = await this.getPeerInfo();
    return info.id;
  }

  /**
   * Get peer private key
   * @returns {Promise<string>} Private key
   */
  async getPrivateKey() {
    const info = await this.getPeerInfo();
    return info.privateKey;
  }

  /**
   * Get peer public key
   * @returns {Promise<string>} Public key
   */
  async getPublicKey() {
    const info = await this.getPeerInfo();
    return info.publicKey;
  }

  /**
   * Reset peer identity (create new one)
   * @returns {Promise<Object>} New peer info
   */
  async resetPeerIdentity() {
    console.log('[PeerPersistence] Resetting peer identity');
    this.peerInfo = await this.createNewPeerInfo();
    await this.savePeerInfo();
    return this.peerInfo;
  }
}

export default PeerPersistence;