/**
 * Peer Discovery Service for Blue Carbon MRV network
 * Scans /24 subnet for active peers and maintains dense network topology
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import CryptoUtils from '../crypto/crypto-utils.js';
import { getConfig } from '../config/config-loader.js';

export class PeerDiscovery extends EventEmitter {
  constructor(p2pServer, options = {}) {
    super();
    this.p2pServer = p2pServer;
    this.config = getConfig();
    
    // Use config values with fallback to options or defaults
    this.peeringPort = options.peeringPort || 3001;
    this.scanInterval = options.scanInterval || 30000;
    this.connectionTimeout = options.connectionTimeout || 5000;
    this.maxConnectionAttempts = options.maxConnectionAttempts || 3;
    this.subnetMask = options.subnetMask || 24;
    this.isRunning = false;
    this.scanTimer = null;
    this.discoveredPeers = new Map(); // ip -> {lastSeen, status, nodeId}
    this.connectionAttempts = new Map(); // ip -> {attempts, lastAttempt}
    this.localSubnets = [];
    
    // Discovery statistics
    this.stats = {
      scansCompleted: 0,
      peersDiscovered: 0,
      connectionsEstablished: 0,
      connectionsFailed: 0,
      lastScanTime: null,
      totalScanTime: 0
    };

    this.initializeLocalSubnets();
  }

  /**
   * Initialize local subnet information
   */
  initializeLocalSubnets() {
    const interfaces = networkInterfaces();
    this.localSubnets = [];

    for (const [name, addresses] of Object.entries(interfaces)) {
      for (const addr of addresses) {
        // Only IPv4, not loopback, not internal
        if (addr.family === 'IPv4' && !addr.internal && addr.address !== '127.0.0.1') {
          const subnet = this.getSubnet(addr.address);
          if (subnet && !this.localSubnets.includes(subnet)) {
            this.localSubnets.push(subnet);
            console.log(`[Discovery] Found local subnet: ${subnet}/${this.subnetMask} on interface ${name}`);
          }
        }
      }
    }

    if (this.localSubnets.length === 0) {
      console.warn(`[Discovery] No local subnets found, using default 192.168.1.0/${this.subnetMask}`);
      // For /24, use "192.168.1", for /16 use "192.168", etc.
      const defaultSubnet = this.subnetMask >= 24 ? '192.168.1' : 
                           this.subnetMask >= 16 ? '192.168' : '192';
      this.localSubnets.push(defaultSubnet);
    }
  }

  /**
   * Load configuration values
   */
  async loadConfigValues() {
    try {
      await this.config.load();
      const config = this.config.getAll();
      this.peeringPort = config.p2p || 3001;
      this.subnetMask = config.subnetMask || 24;
    } catch (error) {
      console.warn('[Discovery] Failed to load config, using defaults');
    }
  }

  /**
   * Get subnet with configurable mask from IP address
   * @param {string} ip - IP address
   * @returns {string} Subnet (e.g., "192.168.1" for /24)
   */
  getSubnet(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    
    // Calculate how many octets to include based on subnet mask
    const octetsToInclude = Math.floor(this.subnetMask / 8);
    const remainderBits = this.subnetMask % 8;
    
    let subnet = parts.slice(0, octetsToInclude).join('.');
    
    // Handle partial octet if needed
    if (remainderBits > 0 && octetsToInclude < 4) {
      const partialOctet = parseInt(parts[octetsToInclude]);
      const mask = (0xFF << (8 - remainderBits)) & 0xFF;
      const maskedOctet = partialOctet & mask;
      subnet += (subnet ? '.' : '') + maskedOctet;
    }
    
    return subnet;
  }

  /**
   * Get /24 subnet from IP address (legacy method for backwards compatibility)
   * @param {string} ip - IP address
   * @returns {string} Subnet (e.g., "192.168.1")
   */
  getSubnet24(ip) {
    return this.getSubnet(ip);
  }

  /**
   * Start peer discovery
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[Discovery] Starting peer discovery on port ${this.peeringPort}`);
    
    // Start initial scan
    this.scanForPeers();
    
    // Schedule periodic scans
    this.scanTimer = setInterval(() => {
      this.scanForPeers();
    }, this.scanInterval);

    this.emit('discovery_started');
  }

  /**
   * Stop peer discovery
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }

    console.log('[Discovery] Peer discovery stopped');
    this.emit('discovery_stopped');
  }

  /**
   * Scan all local subnets for peers
   */
  async scanForPeers() {
    if (!this.isRunning) return;

    const scanStartTime = Date.now();
    console.log(`[Discovery] Starting subnet scan...`);

    try {
      const scanPromises = this.localSubnets.map(subnet => this.scanSubnet(subnet));
      await Promise.all(scanPromises);

      this.stats.scansCompleted++;
      this.stats.lastScanTime = new Date().toISOString();
      this.stats.totalScanTime += Date.now() - scanStartTime;

      console.log(`[Discovery] Scan completed in ${Date.now() - scanStartTime}ms. Found ${this.discoveredPeers.size} peers`);
      this.emit('scan_completed', { 
        peersFound: this.discoveredPeers.size,
        scanTime: Date.now() - scanStartTime 
      });

    } catch (error) {
      console.error('[Discovery] Error during subnet scan:', error);
    }
  }

  /**
   * Scan specific subnet for active peers
   * @param {string} subnet - Subnet prefix (e.g., "192.168.1" for /24)
   */
  async scanSubnet(subnet) {
    console.log(`[Discovery] Scanning subnet ${subnet}.0/${this.subnetMask}`);

    // Generate list of IPs to scan based on subnet mask
    const ips = this.generateIPsForSubnet(subnet);

    // Scan IPs in batches to avoid overwhelming the network
    const batchSize = 20;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const scanPromises = batch.map(ip => this.scanHost(ip));
      
      await Promise.all(scanPromises);
      
      // Small delay between batches
      await this.sleep(100);
    }
  }

  /**
   * Generate IP addresses for subnet based on subnet mask
   * @param {string} subnet - Subnet prefix
   * @returns {Array} Array of IP addresses to scan
   */
  generateIPsForSubnet(subnet) {
    const parts = subnet.split('.');
    const ips = [];

    if (this.subnetMask >= 24) {
      // /24 or smaller - scan last octet
      for (let i = 1; i <= 254; i++) {
        ips.push(`${subnet}.${i}`);
      }
    } else if (this.subnetMask >= 16) {
      // /16 to /23 - scan last two octets
      for (let i = 0; i <= 255; i++) {
        for (let j = 1; j <= 254; j++) {
          ips.push(`${subnet}.${i}.${j}`);
        }
      }
    } else {
      // Larger subnets - limit scan to avoid overwhelming network
      console.warn(`[Discovery] Large subnet /${this.subnetMask} detected, limiting scan range`);
      for (let i = 1; i <= 10; i++) {
        for (let j = 1; j <= 254; j++) {
          ips.push(`${subnet}.${i}.${j}`);
        }
      }
    }

    return ips;
  }

  /**
   * Scan specific host for peer service
   * @param {string} ip - IP address to scan
   */
  async scanHost(ip) {
    try {
      // Skip our own IP addresses
      if (await this.isLocalAddress(ip)) {
        return;
      }

      const isActive = await this.checkPortOpen(ip, this.peeringPort);
      
      if (isActive) {
        await this.handleDiscoveredPeer(ip);
      } else {
        // Remove from discovered peers if no longer active
        if (this.discoveredPeers.has(ip)) {
          this.discoveredPeers.delete(ip);
          this.emit('peer_lost', { ip });
        }
      }

    } catch (error) {
      // Silent fail for individual host scans
    }
  }

  /**
   * Check if port is open on host
   * @param {string} ip - IP address
   * @param {number} port - Port number
   * @returns {Promise<boolean>} True if port is open
   */
  checkPortOpen(ip, port) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.connectionTimeout);

      // Use netcat or telnet to check port
      const nc = spawn('nc', ['-z', '-w', '1', ip, port.toString()]);
      
      nc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0);
      });

      nc.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Handle newly discovered peer
   * @param {string} ip - Peer IP address
   */
  async handleDiscoveredPeer(ip) {
    const now = Date.now();
    const existing = this.discoveredPeers.get(ip);

    // Update discovery record
    this.discoveredPeers.set(ip, {
      lastSeen: now,
      status: 'discovered',
      nodeId: existing?.nodeId || null
    });

    if (!existing) {
      console.log(`[Discovery] New peer discovered: ${ip}:${this.peeringPort}`);
      this.stats.peersDiscovered++;
      this.emit('peer_discovered', { ip, port: this.peeringPort });

      // Attempt to connect
      await this.attemptConnection(ip);
    } else {
      // Update last seen time
      existing.lastSeen = now;
    }
  }

  /**
   * Attempt to connect to discovered peer
   * @param {string} ip - Peer IP address
   */
  async attemptConnection(ip) {
    const attempts = this.connectionAttempts.get(ip) || { attempts: 0, lastAttempt: 0 };
    
    // Check if we should retry connection
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
    if (attempts.attempts >= this.maxConnectionAttempts && timeSinceLastAttempt < 300000) {
      return; // Wait 5 minutes before retrying after max attempts
    }

    // Check if already connected to this peer
    const connectedPeers = this.p2pServer.getConnectedPeers();
    const alreadyConnected = connectedPeers.some(peer => {
      // This is simplified - in reality, we'd need better peer identification
      return peer.info.address === ip;
    });

    if (alreadyConnected) {
      return;
    }

    attempts.attempts++;
    attempts.lastAttempt = Date.now();
    this.connectionAttempts.set(ip, attempts);

    try {
      console.log(`[Discovery] Attempting connection to ${ip}:${this.peeringPort} (attempt ${attempts.attempts})`);
      
      const success = await this.p2pServer.connectToPeer(`${ip}:${this.peeringPort}`);
      
      if (success) {
        console.log(`[Discovery] Successfully connected to ${ip}:${this.peeringPort}`);
        this.stats.connectionsEstablished++;
        
        // Update peer status
        const peer = this.discoveredPeers.get(ip);
        if (peer) {
          peer.status = 'connected';
        }
        
        // Reset connection attempts
        this.connectionAttempts.delete(ip);
        
        this.emit('peer_connected', { ip, port: this.peeringPort });
        
      } else {
        console.log(`[Discovery] Failed to connect to ${ip}:${this.peeringPort}`);
        this.stats.connectionsFailed++;
      }

    } catch (error) {
      console.error(`[Discovery] Connection error to ${ip}:${this.peeringPort}:`, error);
      this.stats.connectionsFailed++;
    }
  }

  /**
   * Check if IP address is local to this machine
   * @param {string} ip - IP address to check
   * @returns {Promise<boolean>} True if IP is local
   */
  async isLocalAddress(ip) {
    const interfaces = networkInterfaces();
    
    for (const addresses of Object.values(interfaces)) {
      for (const addr of addresses) {
        if (addr.address === ip) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Maintain dense network topology
   * Ensures all discovered peers are connected to each other
   */
  async maintainDenseTopology() {
    const connectedPeers = this.p2pServer.getConnectedPeers();
    const discoveredIps = Array.from(this.discoveredPeers.keys());

    console.log(`[Discovery] Maintaining dense topology: ${connectedPeers.length} connected, ${discoveredIps.length} discovered`);

    // Try to connect to any discovered but not connected peers
    for (const ip of discoveredIps) {
      const peer = this.discoveredPeers.get(ip);
      if (peer && peer.status !== 'connected') {
        await this.attemptConnection(ip);
        await this.sleep(1000); // Delay between connection attempts
      }
    }

    // Share peer list with connected peers to help them maintain dense topology
    if (connectedPeers.length > 0) {
      this.p2pServer.broadcastPeerList();
    }
  }

  /**
   * Handle peer list received from network
   * @param {Array} peers - List of peer information
   */
  handlePeerListReceived(peers) {
    for (const peer of peers) {
      // Extract IP from peer info (this would need proper implementation)
      // For now, we'll skip this as it requires more complex peer addressing
      console.log(`[Discovery] Received peer info: ${peer.nodeId}`);
    }
  }

  /**
   * Get discovery statistics
   * @returns {Object} Discovery statistics
   */
  getDiscoveryStats() {
    const avgScanTime = this.stats.scansCompleted > 0 ? 
      this.stats.totalScanTime / this.stats.scansCompleted : 0;

    return {
      ...this.stats,
      avgScanTime,
      isRunning: this.isRunning,
      discoveredPeers: this.discoveredPeers.size,
      localSubnets: this.localSubnets,
      connectionAttempts: this.connectionAttempts.size,
      subnetMask: this.subnetMask,
      maxConnectionAttempts: this.maxConnectionAttempts
    };
  }

  /**
   * Get discovered peers list
   * @returns {Array} List of discovered peers
   */
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.entries()).map(([ip, info]) => ({
      ip,
      port: this.peeringPort,
      ...info,
      lastSeenAgo: Date.now() - info.lastSeen
    }));
  }

  /**
   * Force rescan of subnets
   */
  async forceScan() {
    console.log('[Discovery] Forcing immediate subnet scan...');
    await this.scanForPeers();
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add manual peer
   * @param {string} ip - IP address
   * @param {number} port - Port number (optional)
   */
  async addManualPeer(ip, port = null) {
    const peerPort = port || this.peeringPort;
    console.log(`[Discovery] Adding manual peer: ${ip}:${peerPort}`);

    this.discoveredPeers.set(ip, {
      lastSeen: Date.now(),
      status: 'manual',
      nodeId: null
    });

    await this.attemptConnection(ip);
  }

  /**
   * Remove peer from discovery
   * @param {string} ip - IP address to remove
   */
  removePeer(ip) {
    if (this.discoveredPeers.has(ip)) {
      this.discoveredPeers.delete(ip);
      this.connectionAttempts.delete(ip);
      console.log(`[Discovery] Removed peer: ${ip}`);
      this.emit('peer_removed', { ip });
    }
  }

  /**
   * Schedule dense topology maintenance
   */
  startTopologyMaintenance() {
    const maintenanceInterval = 120000; // 2 minutes
    
    // Run dense topology maintenance at configured interval
    setInterval(() => {
      if (this.isRunning) {
        this.maintainDenseTopology();
      }
    }, maintenanceInterval);
  }
}

export default PeerDiscovery;