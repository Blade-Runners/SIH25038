/**
 * Storage and Persistence Layer for Blue Carbon MRV blockchain
 * Handles 1-minute interval storage with memory management
 */

import { writeFile, readFile, mkdir, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import CryptoUtils from '../crypto/crypto-utils.js';
import { getConfig } from '../config/config-loader.js';

export class PersistenceManager extends EventEmitter {
  constructor(dataDir = './data', options = {}) {
    super();
    this.dataDir = dataDir;
    this.config = getConfig();
    
    // Use config values with fallback to options or defaults
    this.saveInterval = options.saveInterval || 120000;
    this.maxMemoryBlocks = options.maxMemoryBlocks || 100;
    this.compressionEnabled = options.compression !== undefined ? options.compression : true;
    
    this.isRunning = false;
    this.saveTimer = null;
    this.lastSaveTime = null;
    this.pendingChanges = new Set(); // Track what needs to be saved
    
    // Storage statistics
    this.stats = {
      totalSaves: 0,
      totalLoads: 0,
      bytesWritten: 0,
      bytesRead: 0,
      saveErrors: 0,
      loadErrors: 0,
      lastSaveSize: 0,
      averageSaveTime: 0,
      totalSaveTime: 0
    };

    // File paths
    this.paths = {
      blockchain: join(this.dataDir, 'blockchain.json'),
      transactions: join(this.dataDir, 'val_pool', 'transactions.json'),
      peers: join(this.dataDir, 'peers', 'peers.json'),
      config: join(this.dataDir, 'config.json'),
      backups: join(this.dataDir, 'backups'),
      blocks: join(this.dataDir, 'blocks'),
      chain: join(this.dataDir, 'chain'),
      valPool: join(this.dataDir, 'val_pool')
    };
  }

  /**
   * Initialize storage system
   */
  async initialize() {
    try {
      // Load config first
      await this.loadConfigValues();
      
      // Create data directories
      await this.createDirectories();
      
      console.log(`[Storage] Initialized with data directory: ${this.dataDir}`);
      this.emit('storage_initialized');
      
    } catch (error) {
      console.error('[Storage] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load configuration values
   */
  async loadConfigValues() {
    try {
      await this.config.load();
      const config = this.config.getAll();
      this.saveInterval = config.saveInterval || 120000;
    } catch (error) {
      console.warn('[Storage] Failed to load config, using defaults');
    }
  }

  /**
   * Start automatic persistence
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    
    // Schedule periodic saves
    this.saveTimer = setInterval(() => {
      this.performScheduledSave();
    }, this.saveInterval);

    console.log(`[Storage] Started automatic persistence (${this.saveInterval}ms interval)`);
    this.emit('persistence_started');
  }

  /**
   * Stop automatic persistence
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    // Perform final save
    if (this.pendingChanges.size > 0) {
      await this.performScheduledSave();
    }

    console.log('[Storage] Stopped automatic persistence');
    this.emit('persistence_stopped');
  }

  /**
   * Create necessary directories
   */
  async createDirectories() {
    const dirs = [
      this.dataDir, 
      this.paths.backups, 
      this.paths.blocks,
      this.paths.chain,
      this.paths.valPool,
      join(this.dataDir, 'peers')
    ];
    
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }

  /**
   * Save blockchain state
   * @param {Blockchain} blockchain - Blockchain instance to save
   */
  async saveBlockchain(blockchain) {
    const saveStartTime = Date.now();
    
    try {
      // Prepare blockchain data for storage
      const blockchainData = this.prepareBlockchainData(blockchain);
      
      // Save main blockchain state
      await this.saveJSON(this.paths.blockchain, blockchainData);
      
      // Save individual blocks for faster access
      await this.saveBlocksIndividually(blockchain.chain);
      
      // Update statistics
      this.stats.totalSaves++;
      this.stats.lastSaveSize = JSON.stringify(blockchainData).length;
      this.stats.totalSaveTime += Date.now() - saveStartTime;
      this.stats.averageSaveTime = this.stats.totalSaveTime / this.stats.totalSaves;
      
      this.lastSaveTime = new Date().toISOString();
      this.pendingChanges.delete('blockchain');
      
      console.log(`[Storage] Blockchain saved (${this.stats.lastSaveSize} bytes, ${Date.now() - saveStartTime}ms)`);
      this.emit('blockchain_saved', { size: this.stats.lastSaveSize });

    } catch (error) {
      this.stats.saveErrors++;
      console.error('[Storage] Failed to save blockchain:', error);
      throw error;
    }
  }

  /**
   * Load blockchain state
   * @returns {Promise<Object|null>} Blockchain data or null if not found
   */
  async loadBlockchain() {
    const loadStartTime = Date.now();
    
    try {
      if (!existsSync(this.paths.blockchain)) {
        console.log('[Storage] No blockchain data found');
        return null;
      }

      const blockchainData = await this.loadJSON(this.paths.blockchain);
      
      // Load individual blocks if they exist
      const blocks = await this.loadBlocksIndividually();
      if (blocks && blocks.length > 0) {
        blockchainData.chain = blocks;
      }

      this.stats.totalLoads++;
      this.stats.bytesRead += JSON.stringify(blockchainData).length;
      
      console.log(`[Storage] Blockchain loaded (${Date.now() - loadStartTime}ms)`);
      this.emit('blockchain_loaded');
      
      return blockchainData;

    } catch (error) {
      this.stats.loadErrors++;
      console.error('[Storage] Failed to load blockchain:', error);
      throw error;
    }
  }

  /**
   * Prepare blockchain data for storage (optimize for size)
   * @param {Blockchain} blockchain - Blockchain instance
   * @returns {Object} Optimized blockchain data
   */
  prepareBlockchainData(blockchain) {
    const chainData = blockchain.toJSON();
    
    // Keep only recent blocks in main file (for faster loading)
    const recentBlocks = chainData.chain.slice(-this.maxMemoryBlocks);
    
    return {
      ...chainData,
      chain: recentBlocks,
      metadata: {
        totalBlocks: chainData.chain.length,
        lastBlock: chainData.chain[chainData.chain.length - 1],
        savedAt: CryptoUtils.getTimestamp(),
        version: '1.0.0'
      }
    };
  }

  /**
   * Save blocks individually for better access patterns
   * @param {Array} blocks - Array of blocks to save
   */
  async saveBlocksIndividually(blocks) {
    const batchSize = 10; // Save blocks in batches
    
    for (let i = 0; i < blocks.length; i += batchSize) {
      const batch = blocks.slice(i, i + batchSize);
      const batchPath = join(this.paths.blocks, `blocks_${Math.floor(i / batchSize)}.json`);
      
      await this.saveJSON(batchPath, {
        startIndex: i,
        endIndex: Math.min(i + batchSize - 1, blocks.length - 1),
        blocks: batch.map(block => block.toJSON ? block.toJSON() : block)
      });
    }
  }

  /**
   * Load blocks from individual files
   * @returns {Promise<Array|null>} Array of blocks or null
   */
  async loadBlocksIndividually() {
    try {
      if (!existsSync(this.paths.blocks)) {
        return null;
      }

      const blockFiles = await readdir(this.paths.blocks);
      const blockBatches = [];

      // Load all block batch files
      for (const fileName of blockFiles.filter(f => f.startsWith('blocks_'))) {
        const filePath = join(this.paths.blocks, fileName);
        const batchData = await this.loadJSON(filePath);
        blockBatches.push(batchData);
      }

      // Sort by start index and combine
      blockBatches.sort((a, b) => a.startIndex - b.startIndex);
      
      const allBlocks = [];
      for (const batch of blockBatches) {
        allBlocks.push(...batch.blocks);
      }

      return allBlocks;

    } catch (error) {
      console.error('[Storage] Error loading individual blocks:', error);
      return null;
    }
  }

  /**
   * Save peer information
   * @param {Array} peers - Array of peer information
   */
  async savePeers(peers) {
    try {
      const peerData = {
        peers: peers,
        savedAt: CryptoUtils.getTimestamp(),
        count: peers.length
      };

      await this.saveJSON(this.paths.peers, peerData);
      this.pendingChanges.delete('peers');
      
      console.log(`[Storage] Saved ${peers.length} peers`);

    } catch (error) {
      console.error('[Storage] Failed to save peers:', error);
      throw error;
    }
  }

  /**
   * Load peer information
   * @returns {Promise<Array>} Array of peers
   */
  async loadPeers() {
    try {
      if (!existsSync(this.paths.peers)) {
        return [];
      }

      const peerData = await this.loadJSON(this.paths.peers);
      return peerData.peers || [];

    } catch (error) {
      console.error('[Storage] Failed to load peers:', error);
      return [];
    }
  }

  /**
   * Save configuration
   * @param {Object} config - Configuration object
   */
  async saveConfig(config) {
    try {
      const configData = {
        ...config,
        savedAt: CryptoUtils.getTimestamp()
      };

      await this.saveJSON(this.paths.config, configData);
      console.log('[Storage] Configuration saved');

    } catch (error) {
      console.error('[Storage] Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Load configuration
   * @returns {Promise<Object>} Configuration object
   */
  async loadConfig() {
    try {
      if (!existsSync(this.paths.config)) {
        return {};
      }

      return await this.loadJSON(this.paths.config);

    } catch (error) {
      console.error('[Storage] Failed to load config:', error);
      return {};
    }
  }

  /**
   * Create backup of current state
   * @param {string} label - Backup label
   */
  async createBackup(label = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupLabel = label || `backup_${timestamp}`;
      const backupDir = join(this.paths.backups, backupLabel);

      await mkdir(backupDir, { recursive: true });

      // Copy all data files to backup directory
      const filesToBackup = [
        { src: this.paths.blockchain, dst: join(backupDir, 'blockchain.json') },
        { src: this.paths.peers, dst: join(backupDir, 'peers.json') },
        { src: this.paths.config, dst: join(backupDir, 'config.json') }
      ];

      for (const { src, dst } of filesToBackup) {
        if (existsSync(src)) {
          const data = await readFile(src);
          await writeFile(dst, data);
        }
      }

      // Create backup metadata
      await this.saveJSON(join(backupDir, 'metadata.json'), {
        label: backupLabel,
        createdAt: CryptoUtils.getTimestamp(),
        version: '1.0.0'
      });

      console.log(`[Storage] Backup created: ${backupLabel}`);
      return backupLabel;

    } catch (error) {
      console.error('[Storage] Backup creation failed:', error);
      throw error;
    }
  }

  /**
   * Restore from backup
   * @param {string} backupLabel - Backup to restore from
   */
  async restoreFromBackup(backupLabel) {
    try {
      const backupDir = join(this.paths.backups, backupLabel);

      if (!existsSync(backupDir)) {
        throw new Error(`Backup not found: ${backupLabel}`);
      }

      // Restore files
      const filesToRestore = [
        { src: join(backupDir, 'blockchain.json'), dst: this.paths.blockchain },
        { src: join(backupDir, 'peers.json'), dst: this.paths.peers },
        { src: join(backupDir, 'config.json'), dst: this.paths.config }
      ];

      for (const { src, dst } of filesToRestore) {
        if (existsSync(src)) {
          const data = await readFile(src);
          await writeFile(dst, data);
        }
      }

      console.log(`[Storage] Restored from backup: ${backupLabel}`);

    } catch (error) {
      console.error('[Storage] Restore failed:', error);
      throw error;
    }
  }

  /**
   * Perform scheduled save operation
   */
  async performScheduledSave() {
    if (this.pendingChanges.size === 0) {
      return; // Nothing to save
    }

    console.log(`[Storage] Performing scheduled save (${this.pendingChanges.size} changes)`);
    
    try {
      // Emit event so blockchain can trigger save
      this.emit('scheduled_save_requested', Array.from(this.pendingChanges));
      
    } catch (error) {
      console.error('[Storage] Scheduled save failed:', error);
    }
  }

  /**
   * Mark data as changed (needs saving)
   * @param {string} type - Type of data that changed
   */
  markChanged(type) {
    this.pendingChanges.add(type);
  }

  /**
   * Save JSON data to file
   * @param {string} filePath - File path
   * @param {Object} data - Data to save
   */
  async saveJSON(filePath, data) {
    const jsonString = JSON.stringify(data, null, 2);
    await writeFile(filePath, jsonString, 'utf8');
    this.stats.bytesWritten += jsonString.length;
  }

  /**
   * Load JSON data from file
   * @param {string} filePath - File path
   * @returns {Promise<Object>} Parsed JSON data
   */
  async loadJSON(filePath) {
    const jsonString = await readFile(filePath, 'utf8');
    this.stats.bytesRead += jsonString.length;
    return JSON.parse(jsonString);
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage statistics
   */
  getStorageStats() {
    return {
      ...this.stats,
      lastSaveTime: this.lastSaveTime,
      pendingChanges: Array.from(this.pendingChanges),
      dataDirectory: this.dataDir,
      isRunning: this.isRunning
    };
  }

  /**
   * Get disk usage information
   * @returns {Promise<Object>} Disk usage stats
   */
  async getDiskUsage() {
    try {
      const files = [
        this.paths.blockchain,
        this.paths.peers,
        this.paths.config
      ];

      let totalSize = 0;
      const fileStats = {};

      for (const file of files) {
        if (existsSync(file)) {
          const stats = await stat(file);
          fileStats[file] = stats.size;
          totalSize += stats.size;
        }
      }

      // Check blocks directory
      if (existsSync(this.paths.blocks)) {
        const blockFiles = await readdir(this.paths.blocks);
        let blocksSize = 0;
        
        for (const blockFile of blockFiles) {
          const stats = await stat(join(this.paths.blocks, blockFile));
          blocksSize += stats.size;
        }
        
        fileStats.blocks = blocksSize;
        totalSize += blocksSize;
      }

      return {
        totalSize,
        files: fileStats,
        formattedSize: this.formatBytes(totalSize)
      };

    } catch (error) {
      console.error('[Storage] Error getting disk usage:', error);
      return { totalSize: 0, files: {}, formattedSize: '0 B' };
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Clean up old backup files
   * @param {number} maxBackups - Maximum number of backups to keep
   */
  async cleanupBackups(maxBackups = 10) {
    try {
      if (!existsSync(this.paths.backups)) {
        return;
      }

      const backups = await readdir(this.paths.backups);
      
      if (backups.length <= maxBackups) {
        return;
      }

      // Sort backups by creation time (oldest first)
      const backupInfo = [];
      for (const backup of backups) {
        const backupPath = join(this.paths.backups, backup);
        const stats = await stat(backupPath);
        backupInfo.push({ name: backup, path: backupPath, created: stats.birthtime });
      }

      backupInfo.sort((a, b) => a.created - b.created);

      // Remove oldest backups
      const toRemove = backupInfo.slice(0, backupInfo.length - maxBackups);
      
      for (const backup of toRemove) {
        // Remove directory recursively
        await this.removeDirectory(backup.path);
        console.log(`[Storage] Removed old backup: ${backup.name}`);
      }

    } catch (error) {
      console.error('[Storage] Backup cleanup failed:', error);
    }
  }

  /**
   * Remove directory recursively
   * @param {string} dirPath - Directory path to remove
   */
  async removeDirectory(dirPath) {
    const { rm } = await import('fs/promises');
    await rm(dirPath, { recursive: true, force: true });
  }
}

export default PersistenceManager;