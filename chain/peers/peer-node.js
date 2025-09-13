/**
 * Peer Node for Blue Carbon MRV Network
 * Lightweight node for distributed network participation
 * Cross-platform compatible (Windows, Linux, macOS)
 */

import APIServer from '../src/api/server.js';
import CryptoUtils from '../src/crypto/crypto-utils.js';
import { loadConfig } from '../src/config/config-loader.js';
import { fileURLToPath } from 'url';

class PeerNode {
  constructor(options = {}) {
    this.nodeId = options.nodeId || CryptoUtils.generateId();
    this.p2pPort = options.p2pPort;
    this.apiPort = options.apiPort;
    this.dataDir = options.dataDir || `./peer-data-${this.nodeId.slice(0, 8)}`;
    this.isValidator = options.isValidator !== false; // Default to validator
    
    this.server = null;
    this.startTime = new Date();
    this.config = null;
    
    console.log(`[Peer] Initializing peer node: ${this.nodeId}`);
  }

  /**
   * Initialize configuration
   */
  async initialize() {
    try {
      console.log(`[Peer] Platform: ${process.platform}`);
      console.log(`[Peer] Node.js: ${process.version}`);
      console.log(`[Peer] Working directory: ${process.cwd()}`);
      console.log(`[Peer] Script path: ${import.meta.url}`);
      
      // Windows-specific diagnostics
      if (process.platform === 'win32') {
        console.log('[Peer] Windows detected - checking environment...');
        console.log(`[Peer] Command: ${process.argv.join(' ')}`);
        console.log(`[Peer] Terminal: ${process.env.TERM || 'unknown'}`);
        console.log(`[Peer] Shell: ${process.env.SHELL || process.env.ComSpec || 'unknown'}`);
      }
      
      // Load configuration
      console.log('[Peer] Loading configuration...');
      this.config = await loadConfig();
      console.log('[Peer] Configuration loaded successfully');
      
      // Apply configuration values if not provided in options
      const configData = this.config || {};
      this.p2pPort = this.p2pPort || configData.p2p || 3001;
      this.apiPort = this.apiPort || configData.port || 3000;
      
      console.log(`[Peer] P2P Port: ${this.p2pPort}`);
      console.log(`[Peer] API Port: ${this.apiPort}`);
      console.log(`[Peer] Data Directory: ${this.dataDir}`);
      
    } catch (error) {
      console.error('[Peer] Configuration initialization failed:', error);
      
      // Enhanced error reporting for Windows
      if (process.platform === 'win32') {
        console.error('[Peer] Windows-specific diagnostics:');
        console.error(`  - Current directory: ${process.cwd()}`);
        console.error(`  - Script location: ${import.meta.url}`);
        console.error('  - Ensure config.json exists in project root');
        console.error(`  - Error type: ${error.constructor.name}`);
        console.error(`  - Error message: ${error.message}`);
        
        if (error.code === 'ENOENT') {
          console.error('  - File not found error - check file paths');
          console.error('  - Try running from the project root directory');
        } else if (error.code === 'MODULE_NOT_FOUND') {
          console.error('  - Module import error - check dependencies');
          console.error('  - Try running: npm install');
        }
      }
      
      throw error;
    }
  }

  /**
   * Start the peer node
   */
  async start() {
    try {
      console.log(`[Peer] Starting peer node...`);

      // Initialize configuration
      await this.initialize();

      console.log(`[Peer] Initializing API server...`);
      
      // Initialize server with peer-specific configuration
      this.server = new APIServer({
        nodeId: this.nodeId,
        port: this.apiPort,
        p2pPort: this.p2pPort,
        dataDir: this.dataDir,
        enableDashboard: false // Disable dashboard for peer nodes
      });

      console.log(`[Peer] Starting server components...`);
      
      // Start the server
      await this.server.start();

      console.log(`[Peer] Peer node started successfully`);
      console.log(`[Peer] Node ID: ${this.nodeId}`);
      console.log(`[Peer] P2P Network: ws://localhost:${this.p2pPort}`);
      console.log(`[Peer] Local API: http://localhost:${this.apiPort}`);
      
      // Log connection instructions for other peers
      console.log(`[Peer] Other peers can connect to: ws://<your-ip>:${this.p2pPort}`);

      // Start peer-specific services
      this.startPeerServices();

    } catch (error) {
      console.error('[Peer] Failed to start peer node:', error);
      console.error('[Peer] Error details:', error.stack);
      
      // More graceful error handling for different platforms
      if (error.code === 'EADDRINUSE') {
        console.error(`[Peer] Port ${this.apiPort || this.p2pPort} is already in use. Try different ports.`);
        if (process.platform === 'win32') {
          console.error('[Peer] Windows: Check Task Manager for processes using these ports');
          console.error('[Peer] Or try: netstat -ano | findstr :3000');
        }
      } else if (error.code === 'EACCES') {
        console.error(`[Peer] Permission denied. Try using ports above 1024.`);
        if (process.platform === 'win32') {
          console.error('[Peer] Windows: Try running as Administrator or use higher port numbers');
        }
      } else if (error.code === 'MODULE_NOT_FOUND') {
        console.error('[Peer] Module not found. Ensure all dependencies are installed.');
        console.error('[Peer] Try running: npm install');
      }
      
      if (process.platform === 'win32') {
        console.error('[Peer] Windows troubleshooting steps:');
        console.error('  1. Ensure you are in the correct project directory');
        console.error('  2. Verify config.json exists in the project root');
        console.error('  3. Check that all npm dependencies are installed');
        console.error('  4. Try running in PowerShell instead of Command Prompt');
        console.error('  5. Make sure Node.js version is 18+ (current: ' + process.version + ')');
      }
      
      process.exit(1);
    }
  }

  /**
   * Stop the peer node
   */
  async stop() {
    console.log('[Peer] Shutting down peer node...');
    
    if (this.server) {
      await this.server.stop();
    }

    console.log('[Peer] Peer node shutdown complete');
  }

  /**
   * Start peer-specific services
   */
  startPeerServices() {
    // Log periodic status
    setInterval(() => {
      this.logPeerStatus();
    }, 60000); // Every minute

    // Connect to known peers
    this.connectToKnownPeers();

    // Setup automatic backup
    this.setupAutomaticBackup();
  }

  /**
   * Log peer status
   */
  logPeerStatus() {
    if (!this.server) return;

    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const stats = this.server.blockchain.getStats();
    const networkStats = this.server.p2pServer.getNetworkStats();
    const discoveryStats = this.server.peerDiscovery.getDiscoveryStats();

    console.log(`[Peer] Status Report (uptime: ${uptime}s)`);
    console.log(`  Blockchain: ${stats.blocks} blocks, ${stats.transactions} transactions`);
    console.log(`  Network: ${networkStats.peersConnected} peers, ${networkStats.messagesReceived} messages received`);
    console.log(`  Discovery: ${discoveryStats.discoveredPeers} peers discovered`);
    console.log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap used`);
  }

  /**
   * Connect to known peers (if any provided)
   */
  async connectToKnownPeers() {
    const knownPeers = process.env.KNOWN_PEERS?.split(',') || [];
    
    if (knownPeers.length > 0) {
      console.log(`[Peer] Attempting to connect to ${knownPeers.length} known peers...`);
      
      for (const peerAddress of knownPeers) {
        try {
          await this.server.p2pServer.connectToPeer(peerAddress.trim());
          console.log(`[Peer] Connected to known peer: ${peerAddress}`);
        } catch (error) {
          console.warn(`[Peer] Failed to connect to ${peerAddress}:`, error.message);
        }
      }
    }
  }

  /**
   * Setup automatic backup
   */
  setupAutomaticBackup() {
    // Create backup every hour
    setInterval(async () => {
      try {
        const backupLabel = `auto_${new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-')}`;
        await this.server.persistence.createBackup(backupLabel);
        console.log(`[Peer] Automatic backup created: ${backupLabel}`);
      } catch (error) {
        console.error('[Peer] Automatic backup failed:', error);
      }
    }, 3600000); // Every hour
  }

  /**
   * Get peer information for network sharing
   */
  getPeerInfo() {
    return {
      nodeId: this.nodeId,
      p2pPort: this.p2pPort,
      apiPort: this.apiPort,
      isValidator: this.isValidator,
      startTime: this.startTime.toISOString(),
      version: '1.0.0'
    };
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {};
  
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  });
  
  return args;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
Blue Carbon MRV Peer Node

Usage: node peer-node.js [options]

Options:
  --help              Show this help message
  --nodeId=<id>       Set custom node ID
  --p2pPort=<port>    Set P2P port (default: random 8080-9079)
  --apiPort=<port>    Set API port (default: random 3000-3999)
  --dataDir=<dir>     Set data directory
  --noValidator       Run as non-validator node

Environment Variables:
  KNOWN_PEERS         Comma-separated list of peer addresses (host:port)
  NODE_ID            Node ID (overrides --nodeId)
  P2P_PORT           P2P port (overrides --p2pPort)
  API_PORT           API port (overrides --apiPort)
  DATA_DIR           Data directory (overrides --dataDir)

Examples:
  node peer-node.js
  node peer-node.js --p2pPort=8080 --apiPort=3000
  KNOWN_PEERS=192.168.1.10:8080,192.168.1.11:8080 node peer-node.js
`);
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();
  
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Parse configuration
  const config = {
    nodeId: process.env.NODE_ID || args.nodeId,
    p2pPort: parseInt(process.env.P2P_PORT || args.p2pPort) || undefined,
    apiPort: parseInt(process.env.API_PORT || args.apiPort) || undefined,
    dataDir: process.env.DATA_DIR || args.dataDir,
    isValidator: !args.noValidator
  };

  // Create and start peer
  const peer = new PeerNode(config);

  // Handle graceful shutdown (cross-platform compatible)
  const gracefulShutdown = async (signal) => {
    console.log(`\n[Peer] Received ${signal}, shutting down gracefully...`);
    try {
      await peer.stop();
      process.exit(0);
    } catch (error) {
      console.error('[Peer] Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Handle SIGINT (Ctrl+C) - works on all platforms
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle SIGTERM - may not work on Windows, but safe to register
  if (process.platform !== 'win32') {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }

  // Windows-specific process termination
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
  }

  process.on('uncaughtException', (error) => {
    console.error('[Peer] Uncaught exception:', error);
    console.error('[Peer] Stack trace:', error.stack);
    
    // Platform-specific error messages
    if (process.platform === 'win32') {
      console.error('[Peer] Windows users: Ensure Windows Terminal or PowerShell is being used');
      console.error('[Peer] Avoid using Command Prompt for better compatibility');
    }
    
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Peer] Unhandled rejection at:', promise, 'reason:', reason);
    
    // More detailed error info for debugging
    if (reason && reason.stack) {
      console.error('[Peer] Rejection stack trace:', reason.stack);
    }
    
    process.exit(1);
  });

  // Start the peer
  try {
    console.log(`[Peer] Starting on platform: ${process.platform}`);
    console.log(`[Peer] Node.js version: ${process.version}`);
    
    if (process.platform === 'win32') {
      console.log('[Peer] Windows platform detected');
      console.log('[Peer] If the script exits unexpectedly, check the troubleshooting output above');
    }
    
    await peer.start();
  } catch (error) {
    console.error('[Peer] Failed to start peer node:', error);
    
    // Platform-specific error handling
    if (process.platform === 'win32') {
      console.error('[Peer] Windows troubleshooting:');
      console.error('  - Try running in Windows PowerShell instead of Command Prompt');
      console.error('  - Ensure Node.js is properly installed and in PATH');
      console.error('  - Check if ports are available or blocked by firewall');
      console.error('  - Verify you are running from the project root directory');
      console.error('  - Ensure config.json exists and is readable');
      
      if (error.code === 'EADDRINUSE') {
        console.error('  - Another application is using the required ports (3000/3001)');
        console.error('  - Use: netstat -ano | findstr :3000 to find processes using port 3000');
        console.error('  - Use: netstat -ano | findstr :3001 to find processes using port 3001');
      } else if (error.code === 'EACCES') {
        console.error('  - Permission denied. Try running as Administrator');
      } else if (error.code === 'MODULE_NOT_FOUND') {
        console.error('  - Dependencies missing. Run: npm install');
      } else if (error.code === 'ENOENT') {
        console.error('  - File not found. Check project structure and file paths');
      }
      
      console.error(`[Peer] Error details - Type: ${error.constructor.name}, Code: ${error.code}, Message: ${error.message}`);
    }
    
    throw error;
  }
}

// Run if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('[Peer] Startup failed:', error);
    process.exit(1);
  });
}

export default PeerNode;