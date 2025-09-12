/**
 * Configuration Loader for Blue Carbon MRV system
 * Loads and manages system configuration from config.json
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

export class ConfigLoader {
  constructor(configPath = null) {
    this.configPath = configPath || join(projectRoot, 'config.json');
    this.config = null;
    this.defaultConfig = {
      saveInterval: 120000, // 2 minutes
      subnetMask: 24, // /24 subnet
      sim_thres: 0.85, // 85% similarity to consider same
      timeout: 300, // 5 minutes timeout in seconds
      port: 3000, // HTTP API port
      p2p: 3001, // P2P WebSocket port
      privilegedUuid: "DASHBOARD", // UUID that skips validation
      uuid_val_thres: 0.67, // 2/3 threshold for UUID validation
      peer_val_thres: 0.33 // 1/3 threshold for peer validation
    };
  }

  /**
   * Load configuration from file
   * @returns {Promise<Object>} Configuration object
   */
  async load() {
    try {
      if (existsSync(this.configPath)) {
        const configData = await readFile(this.configPath, 'utf8');
        const fileConfig = JSON.parse(configData);
        
        // Merge with defaults
        this.config = { ...this.defaultConfig, ...fileConfig };
        console.log(`[Config] Loaded configuration from: ${this.configPath}`);
        
      } else {
        console.warn(`[Config] Configuration file not found: ${this.configPath}, using defaults`);
        this.config = { ...this.defaultConfig };
      }

      // Validate configuration
      this.validate();
      
      return this.config;

    } catch (error) {
      console.error('[Config] Error loading configuration:', error);
      console.log('[Config] Falling back to default configuration');
      this.config = { ...this.defaultConfig };
      return this.config;
    }
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    return this.config[key];
  }

  /**
   * Get all configuration
   * @returns {Object} Full configuration
   */
  getAll() {
    return this.config || this.defaultConfig;
  }

  /**
   * Validate configuration values
   */
  validate() {
    const config = this.config;

    // Validate saveInterval
    if (config.saveInterval < 10000) {
      throw new Error('Save interval must be at least 10 seconds');
    }

    // Validate network configuration
    if (config.subnetMask < 8 || config.subnetMask > 30) {
      throw new Error('Network subnet mask must be between /8 and /30');
    }

    // Validate validation configuration
    if (config.sim_thres < 0.1 || config.sim_thres > 1.0) {
      throw new Error('Similarity threshold must be between 0.1 and 1.0');
    }

    if (config.uuid_val_thres < 0.1 || config.uuid_val_thres > 1.0) {
      throw new Error('UUID validation threshold must be between 0.1 and 1.0');
    }

    if (config.peer_val_thres < 0.1 || config.peer_val_thres > 1.0) {
      throw new Error('Peer validation threshold must be between 0.1 and 1.0');
    }

    if (config.timeout < 30) {
      throw new Error('Validation timeout must be at least 30 seconds');
    }

    // Validate API configuration
    if (config.port < 1000 || config.port > 65535) {
      throw new Error('API port must be between 1000 and 65535');
    }

    if (config.p2p < 1000 || config.p2p > 65535) {
      throw new Error('P2P port must be between 1000 and 65535');
    }

    if (config.port === config.p2p) {
      throw new Error('API port and P2P port must be different');
    }

    console.log('[Config] Configuration validation passed');
  }

  /**
   * Get configuration summary for logging
   * @returns {Object} Configuration summary
   */
  getSummary() {
    if (!this.config) return {};

    return {
      saveInterval: `${this.config.saveInterval}ms`,
      subnetMask: `/${this.config.subnetMask}`,
      sim_thres: `${(this.config.sim_thres * 100).toFixed(1)}%`,
      uuid_val_thres: `${(this.config.uuid_val_thres * 100).toFixed(1)}%`,
      peer_val_thres: `${(this.config.peer_val_thres * 100).toFixed(1)}%`,
      timeout: `${this.config.timeout}s`,
      ports: `${this.config.port}/${this.config.p2p}`,
      privilegedUuid: this.config.privilegedUuid
    };
  }

  /**
   * Reload configuration from file
   * @returns {Promise<Object>} Reloaded configuration
   */
  async reload() {
    console.log('[Config] Reloading configuration...');
    return await this.load();
  }
}

// Singleton instance
let configInstance = null;

/**
 * Get global configuration instance
 * @param {string} configPath - Optional path to config file
 * @returns {ConfigLoader} Configuration loader instance
 */
export function getConfig(configPath = null) {
  if (!configInstance) {
    configInstance = new ConfigLoader(configPath);
  }
  return configInstance;
}

/**
 * Load configuration (convenience function)
 * @param {string} configPath - Optional path to config file
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig(configPath = null) {
  const config = getConfig(configPath);
  return await config.load();
}

export default ConfigLoader;