/**
 * API Server for Blue Carbon MRV system
 * Provides REST API, dashboard, and documentation endpoints
 */

import { createServer } from 'http';
import { parse } from 'url';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

import Blockchain from '../blockchain/chain.js';
import Transaction from '../blockchain/transaction.js';
import ProofOfAuthority from '../consensus/poa.js';
import CarbonCreditsContract from '../contracts/carbon-credits.js';
import P2PServer from '../network/p2p-server.js';
import PeerDiscovery from '../network/peer-discovery.js';
import PersistenceManager from '../storage/persistence.js';
import PeerPersistence from '../storage/peer-persistence.js';
import ValidationPool from '../validation/validation-pool.js';
import CryptoUtils from '../crypto/crypto-utils.js';
import { loadConfig, getConfig } from '../config/config-loader.js';
import DataSimilarity from '../utils/data-similarity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '../..');

export class APIServer {
  constructor(options = {}) {
    this.config = null;
    this.port = options.port;
    this.p2pPort = options.p2pPort;
    this.nodeId = options.nodeId || CryptoUtils.generateId();
    this.enableDashboard = options.enableDashboard;
    
    this.blockchain = null;
    this.carbonContract = null;
    this.persistence = null;
    this.peerPersistence = null;
    this.validationPool = null;
    this.p2pServer = null;
    this.peerDiscovery = null;
    this.consensus = null;
    this.dataSimilarity = null;
    
    this.server = null;
    this.isRunning = false;
    
    this.nodeKeys = null;
    
    this.registeredIdentities = new Map();
    this.validationPool = new Map();
    this.validationTimeout = null;
  }

  /**
   * Initialize configuration and components
   */
  async initialize() {
    this.config = getConfig();
    await this.config.load();
    
    console.log('[API] Configuration loaded:', this.config.getSummary());
    
    // Apply configuration values
    const config = this.config.getAll();
    
    this.port = this.port || config.port;
    this.p2pPort = this.p2pPort || config.p2p;
    this.enableDashboard = this.enableDashboard !== undefined ? this.enableDashboard : true;
    this.validationTimeout = config.timeout * 1000; // Convert to milliseconds
    
    // Initialize core components with configuration
    this.blockchain = new Blockchain();
    this.carbonContract = new CarbonCreditsContract(this.blockchain);
    this.persistence = new PersistenceManager();
    this.peerPersistence = new PeerPersistence();
    this.validationPool = new ValidationPool();
    this.p2pServer = new P2PServer(this.p2pPort, this.nodeId);
    this.peerDiscovery = new PeerDiscovery(this.p2pServer);
    this.consensus = new ProofOfAuthority(this.blockchain);
    this.dataSimilarity = new DataSimilarity(config.sim_thres);
    
    // Initialize node keys
    await this.initializeNodeKeys();
    
    // Setup component integration
    this.setupEventHandlers();
  }

  /**
   * Initialize node keys using persistent identity
   */
  async initializeNodeKeys() {
    // Get persistent peer info
    const peerInfo = await this.peerPersistence.getPeerInfo();
    this.nodeId = peerInfo.id;
    
    this.nodeKeys = {
      privateKey: peerInfo.privateKey,
      publicKey: peerInfo.publicKey
    };
    
    // Add this node as an authority
    this.blockchain.addAuthority(this.nodeId, this.nodeKeys.publicKey);
    
    console.log(`[API] Node initialized with persistent identity: ${this.nodeId}`);
  }

  /**
   * Setup event handlers between components
   */
  setupEventHandlers() {
    // P2P events
    this.p2pServer.on('new_transaction', ({ transaction }) => {
      this.handleNewTransaction(transaction);
    });

    this.p2pServer.on('new_block', ({ block }) => {
      this.consensus.receiveBlock(block);
    });

    this.p2pServer.on('sync_request', ({ ws, request }) => {
      this.handleSyncRequest(ws, request);
    });

    // New validation system events
    this.p2pServer.on('validation_request', ({ ws, transactionId, transaction, submittedBy }) => {
      this.handleValidationRequest(ws, transactionId, transaction, submittedBy);
    });

    this.p2pServer.on('validation_submission', ({ ws, transactionId, data, submittedBy, peerAddress }) => {
      this.handleValidationSubmission(transactionId, data, submittedBy, peerAddress);
    });

    // Consensus events
    this.consensus.on('block_produced', ({ block }) => {
      this.p2pServer.broadcastBlock(block);
      this.persistence.markChanged('blockchain');
    });

    // Storage events
    this.persistence.on('scheduled_save_requested', async (changes) => {
      if (changes.includes('blockchain')) {
        await this.persistence.saveBlockchain(this.blockchain);
      }
    });

    // Update validation pool with peer/UUID counts regularly
    setInterval(() => {
      this.updateValidationPoolCounts();
    }, 10000); // Every 10 seconds
  }

  /**
   * Start the API server and all components
   */
  async start() {
    if (this.isRunning) return;

    try {
      console.log('[API] Starting Blue Carbon MRV system...');

      // Initialize configuration and components
      await this.initialize();

      // Initialize storage
      await this.persistence.initialize();
      
      // Load existing data
      await this.loadBlockchainData();
      
      // Start P2P server
      await this.p2pServer.start();
      
      // Start peer discovery
      this.peerDiscovery.start();
      this.peerDiscovery.startTopologyMaintenance();
      
      // Start persistence
      this.persistence.start();
      
      // Start consensus (if we're an authority)
      if (this.nodeKeys) {
        this.consensus.start(this.nodeId, this.nodeKeys.privateKey);
      }

      // Start HTTP server
      await this.startHTTPServer();

      this.isRunning = true;
      console.log(`[API] Blue Carbon MRV system started successfully`);
      console.log(`[API] HTTP API: http://localhost:${this.port}`);
      console.log(`[API] P2P Network: ws://localhost:${this.p2pPort}`);
      console.log(`[API] Dashboard: http://localhost:${this.port}/dashboard`);
      console.log(`[API] Documentation: http://localhost:${this.port}/docs`);

    } catch (error) {
      console.error('[API] Failed to start system:', error);
      throw error;
    }
  }

  /**
   * Stop the API server and all components
   */
  async stop() {
    if (!this.isRunning) return;

    console.log('[API] Shutting down Blue Carbon MRV system...');

    this.isRunning = false;

    // Stop components in reverse order
    this.consensus.stop();
    await this.persistence.stop();
    this.peerDiscovery.stop();
    await this.p2pServer.stop();

    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }

    console.log('[API] System shutdown complete');
  }

  /**
   * Start HTTP server
   */
  async startHTTPServer() {
    this.server = createServer((req, res) => {
      this.handleHTTPRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Handle HTTP requests
   */
  async handleHTTPRequest(req, res) {
    const { pathname, query } = parse(req.url, true);
    const method = req.method;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Route handling
      if (pathname === '/') {
        await this.handleRoot(req, res);
      } else if (pathname === '/dashboard' && this.enableDashboard) {
        await this.handleDashboard(req, res);
      } else if (pathname === '/docs' && this.enableDashboard) {
        await this.handleDocs(req, res);
      } else if (pathname.startsWith('/api/')) {
        await this.handleAPIRequest(req, res, pathname, query);
      } else if (pathname.startsWith('/static/') && this.enableDashboard) {
        await this.handleStaticFile(req, res, pathname);
      } else {
        this.sendError(res, 404, 'Not Found');
      }

    } catch (error) {
      console.error('[API] Request error:', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Handle root endpoint
   */
  async handleRoot(req, res) {
    const status = {
      service: 'Blue Carbon MRV System',
      version: '1.0.0',
      status: 'operational',
      nodeId: this.nodeId,
      blockchain: this.blockchain.getStats(),
      network: this.p2pServer.getNetworkStats(),
      storage: this.persistence.getStorageStats()
    };

    this.sendJSON(res, status);
  }

  /**
   * Handle dashboard endpoint
   */
  async handleDashboard(req, res) {
    const dashboardHTML = await this.loadDashboardHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(dashboardHTML);
  }

  /**
   * Handle documentation endpoint
   */
  async handleDocs(req, res) {
    const docsHTML = await this.loadDocsHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(docsHTML);
  }

  /**
   * Handle API requests
   */
  async handleAPIRequest(req, res, pathname, query) {
    const apiPath = pathname.replace('/api', '');
    const method = req.method;

    // API routing - only required endpoints
    switch (true) {
      // Identity management endpoints
      case apiPath === '/register' && method === 'POST':
        await this.handleRegisterIdentity(req, res);
        break;

      case apiPath === '/submit' && method === 'POST':
        await this.handleSubmitWithAuth(req, res);
        break;

      // Balance endpoint
      case apiPath === '/balance' && method === 'GET':
        await this.handleGetBalance(req, res, query);
        break;

      // Transaction history endpoint
      case apiPath === '/transactions' && method === 'GET':
        await this.handleGetTransactions(req, res, query);
        break;

      // Blockchain data endpoint
      case apiPath === '/blockchain' && method === 'GET':
        await this.handleGetBlockchain(req, res, query);
        break;

      default:
        this.sendError(res, 404, 'API endpoint not found');
    }
  }

  /**
   * Get blockchain data
   */
  async handleGetBlockchain(req, res, query) {
    const limit = parseInt(query.limit) || 10;
    const offset = parseInt(query.offset) || 0;
    
    const chain = this.blockchain.chain.slice(offset, offset + limit);
    
    this.sendJSON(res, {
      chain: chain.map(block => block.toJSON()),
      total: this.blockchain.chain.length,
      limit,
      offset
    });
  }

  /**
   * Create new transaction
   */
  async handleCreateTransaction(req, res) {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);

    let transaction;

    switch (data.type) {
      case 'restoration':
        transaction = Transaction.createRestoration(data);
        break;
      case 'credit_transfer':
        transaction = Transaction.createCreditTransfer(data);
        break;
      case 'validation':
        transaction = Transaction.createValidation(data);
        break;
      default:
        this.sendError(res, 400, 'Invalid transaction type');
        return;
    }

    // Sign transaction if private key provided
    if (data.privateKey) {
      transaction.sign(data.privateKey);
    }

    // Add to blockchain
    this.blockchain.addTransaction(transaction);

    // Broadcast to network
    this.p2pServer.broadcastTransaction(transaction.toJSON());

    this.sendJSON(res, {
      success: true,
      transactionId: transaction.id,
      message: 'Transaction created and broadcasted'
    });
  }

  /**
   * Get transactions
   */
  /**
   * Get detailed transaction information with filtering support
   */
  async handleGetTransactions(req, res, query) {
    const type = query.type;
    const uuid = query.uuid;
    const status = query.status; // 'finalized' or 'pending'
    const limit = parseInt(query.limit) || 50;
    const offset = parseInt(query.offset) || 0;
    
    let transactions = [];
    
    // Get finalized transactions from all blocks
    for (const block of this.blockchain.chain) {
      for (const tx of block.transactions) {
        const txWithDetails = {
          ...tx,
          status: 'finalized',
          blockHash: block.hash,
          blockIndex: block.index,
          blockTimestamp: block.timestamp,
          confirmations: this.blockchain.chain.length - block.index
        };
        
        // Apply filters
        if (type && tx.type !== type) continue;
        if (uuid && tx.fromOrganization !== uuid && tx.toOrganization !== uuid) continue;
        if (status && status !== 'finalized') continue;
        
        transactions.push(txWithDetails);
      }
    }

    // Add pending transactions if not filtered out
    if (!status || status === 'pending') {
      for (const tx of this.blockchain.pendingTransactions) {
        const txWithDetails = {
          ...tx,
          status: 'pending',
          blockHash: null,
          blockIndex: null,
          blockTimestamp: null,
          confirmations: 0
        };
        
        // Apply filters
        if (type && tx.type !== type) continue;
        if (uuid && tx.fromOrganization !== uuid && tx.toOrganization !== uuid) continue;
        
        transactions.push(txWithDetails);
      }
    }

    // Sort by timestamp (newest first)
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const paginatedTransactions = transactions.slice(offset, offset + limit);
    
    this.sendJSON(res, {
      transactions: paginatedTransactions,
      pagination: {
        total: transactions.length,
        limit,
        offset,
        hasMore: offset + limit < transactions.length
      },
      filters: {
        type,
        uuid,
        status
      }
    });
  }

  /**
   * Get carbon credit balance
   */
  /**
   * Get balance for UUID
   */
  async handleGetBalance(req, res, query) {
    const uuid = query.uuid;
    
    if (!uuid) {
      this.sendError(res, 400, 'uuid parameter required');
      return;
    }

    const balance = this.carbonContract.getCreditBalance(uuid);
    const portfolio = this.carbonContract.getOrganizationPortfolio(uuid);

    this.sendJSON(res, {
      uuid,
      balance,
      portfolio
    });
  }

  /**
   * Transfer carbon credits
   */
  async handleTransferCredits(req, res) {
    const body = await this.readRequestBody(req);
    const { from, to, amount, price } = JSON.parse(body);

    try {
      const transferId = this.carbonContract.transferCredits(from, to, amount, price);
      
      this.sendJSON(res, {
        success: true,
        transferId,
        message: 'Credits transferred successfully'
      });

    } catch (error) {
      this.sendError(res, 400, error.message);
    }
  }

  /**
   * Submit restoration data
   */
  async handleSubmitRestoration(req, res) {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);

    try {
      // Check if this is a dashboard submission (has special flag or comes via dashboard path)
      const isDashboardSubmission = data.isDashboardSubmission || req.headers['x-dashboard-submission'];
      
      if (isDashboardSubmission) {
        // Dashboard submissions: auto-approve, no validation, no carbon credits
        const transaction = Transaction.createRestoration({
          ...data,
          isDashboardSubmission: true,
          autoApproved: true
        });
        
        if (data.privateKey) {
          transaction.sign(data.privateKey);
        }

        this.blockchain.addTransaction(transaction);
        this.p2pServer.broadcastTransaction(transaction.toJSON());
        
        // Mine block immediately for dashboard submissions
        await this.consensus.mineBlock();

        this.sendJSON(res, {
          success: true,
          transactionId: transaction.id,
          message: 'Restoration data added directly to blockchain (dashboard submission)',
          carbonCredits: 0 // No credits for dashboard submissions
        });

      } else {
        // Regular API submissions: require authentication through /submit endpoint
        this.sendError(res, 400, 'API submissions must use /api/submit endpoint with authentication');
      }

    } catch (error) {
      this.sendError(res, 400, error.message);
    }
  }

  /**
   * Get restoration status
   */
  async handleGetRestorationStatus(req, res, query) {
    const restorationId = query.id;
    
    if (!restorationId) {
      this.sendError(res, 400, 'id parameter required');
      return;
    }

    const status = this.blockchain.getRestorationStatus(restorationId);
    
    if (!status) {
      this.sendError(res, 404, 'Restoration not found');
      return;
    }

    this.sendJSON(res, status);
  }

  /**
   * Handle new transaction from network
   */
  handleNewTransaction(transactionData) {
    try {
      const transaction = Transaction.fromJSON(transactionData);
      
      if (transaction.isValid()) {
        this.blockchain.addTransaction(transaction);
        console.log(`[API] Received valid transaction: ${transaction.id}`);
      } else {
        console.warn(`[API] Received invalid transaction: ${transaction.id}`);
      }

    } catch (error) {
      console.error('[API] Error handling new transaction:', error);
    }
  }

  /**
   * Handle sync request from peer
   */
  handleSyncRequest(ws, request) {
    const fromBlock = request.fromBlock || 0;
    const blocks = this.blockchain.chain.slice(fromBlock);
    
    this.p2pServer.sendBlockchainSync(ws, blocks.map(b => b.toJSON()));
  }

  /**
   * Load blockchain data from storage
   */
  async loadBlockchainData() {
    try {
      const data = await this.persistence.loadBlockchain();
      
      if (data) {
        this.blockchain.loadFromJSON(data);
        console.log(`[API] Loaded blockchain with ${data.chain.length} blocks`);
      }

    } catch (error) {
      console.error('[API] Error loading blockchain data:', error);
    }
  }

  /**
   * Load dashboard HTML
   */
  async loadDashboardHTML() {
    try {
      const dashboardPath = join(__dirname, '../../dashboard/index.html');
      return await readFile(dashboardPath, 'utf8');
    } catch (error) {
      return this.getDefaultDashboard();
    }
  }

  /**
   * Load documentation HTML
   */
  async loadDocsHTML() {
    return this.getDefaultDocs();
  }

  /**
   * Get default dashboard HTML
   */
  getDefaultDashboard() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Blue Carbon MRV Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .card { border: 1px solid #ddd; padding: 20px; margin: 10px 0; border-radius: 5px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .stat { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .log { background: #000; color: #0f0; padding: 10px; font-family: monospace; height: 200px; overflow-y: scroll; }
    </style>
</head>
<body>
    <h1>Blue Carbon MRV Dashboard</h1>
    
    <div class="card">
        <h2>System Status</h2>
        <div class="stats" id="stats">
            Loading...
        </div>
    </div>

    <div class="card">
        <h2>Submit Restoration Data (Direct Entry - No Validation)</h2>
        <p><em>Dashboard submissions are added directly to the blockchain without peer validation and do not issue carbon credits.</em></p>
        <form id="restorationForm">
            <input type="text" id="orgId" placeholder="Organization ID" required>
            <input type="number" id="lat" placeholder="Latitude" step="any" required>
            <input type="number" id="lng" placeholder="Longitude" step="any" required>
            <input type="number" id="area" placeholder="Area (sq meters)" required>
            <button type="submit">Submit Restoration</button>
        </form>
    </div>

    <div class="card">
        <h2>System Log</h2>
        <div class="log" id="log"></div>
    </div>

    <script>
        // Dashboard JavaScript
        async function updateStats() {
            try {
                const response = await fetch('/');
                const data = await response.json();
                
                document.getElementById('stats').innerHTML = \`
                    <div class="stat">
                        <h3>Blocks</h3>
                        <p>\${data.blockchain.blocks}</p>
                    </div>
                    <div class="stat">
                        <h3>Transactions</h3>
                        <p>\${data.blockchain.transactions}</p>
                    </div>
                    <div class="stat">
                        <h3>Carbon Credits</h3>
                        <p>\${data.blockchain.totalCredits || 0}</p>
                    </div>
                    <div class="stat">
                        <h3>Connected Peers</h3>
                        <p>\${data.network.peersConnected || 0}</p>
                    </div>
                \`;
            } catch (error) {
                console.error('Error updating stats:', error);
            }
        }

        document.getElementById('restorationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const restorationData = {
                type: 'restoration',
                organizationId: document.getElementById('orgId').value,
                location: {
                    latitude: parseFloat(document.getElementById('lat').value),
                    longitude: parseFloat(document.getElementById('lng').value)
                },
                area: parseFloat(document.getElementById('area').value),
                speciesData: [],
                images: [],
                timestamp: new Date().toISOString()
            };

            try {
                // Dashboard uses privileged UUID to bypass validation
                const response = await fetch('/api/submit', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        uuid: 'DASHBOARD',
                        key: 'privileged',
                        data: restorationData
                    })
                });

                const result = await response.json();
                if (result.success || result.transactionId) {
                    alert(\`Restoration data submitted successfully! Transaction ID: \${result.transactionId}\`);
                    document.getElementById('restorationForm').reset();
                } else {
                    alert('Error: ' + (result.message || result.error));
                }
            } catch (error) {
                alert('Error submitting data: ' + error.message);
            }
        });

        // Update stats every 5 seconds
        setInterval(updateStats, 5000);
        updateStats();
    </script>
</body>
</html>`;
  }

  /**
   * Get default documentation HTML
   */
  getDefaultDocs() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Blue Carbon MRV API Documentation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .endpoint { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { background: #007bff; color: white; padding: 5px 10px; border-radius: 3px; font-weight: bold; }
        .path { font-family: monospace; background: #f5f5f5; padding: 5px; border-radius: 3px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>Blue Carbon MRV API Documentation</h1>
    
    <h2>Overview</h2>
    <p>This API provides endpoints for interacting with the Blue Carbon MRV blockchain system.</p>

    <h2>Endpoints</h2>

    <div class="endpoint">
        <h3><span class="method">GET</span> <span class="path">/</span></h3>
        <p>Get system status and statistics.</p>
    </div>

    <div class="endpoint">
        <h3><span class="method">GET</span> <span class="path">/api/blockchain</span></h3>
        <p>Get blockchain data with pagination.</p>
        <strong>Query Parameters:</strong>
        <ul>
            <li><code>limit</code> - Number of blocks to return (default: 10)</li>
            <li><code>offset</code> - Starting block index (default: 0)</li>
        </ul>
    </div>

    <div class="endpoint">
        <h3><span class="method">POST</span> <span class="path">/api/transactions</span></h3>
        <p>Create a new transaction.</p>
        <strong>Request Body:</strong>
        <pre>{
  "type": "restoration",
  "organizationId": "org123",
  "location": {
    "latitude": 12.345,
    "longitude": 67.890
  },
  "area": 1000,
  "speciesData": [],
  "images": []
}</pre>
    </div>

    <div class="endpoint">
        <h3><span class="method">GET</span> <span class="path">/api/carbon-credits/balance</span></h3>
        <p>Get carbon credit balance for an organization.</p>
        <strong>Query Parameters:</strong>
        <ul>
            <li><code>organizationId</code> - Organization ID (required)</li>
        </ul>
    </div>

    <div class="endpoint">
        <h3><span class="method">POST</span> <span class="path">/api/carbon-credits/transfer</span></h3>
        <p>Transfer carbon credits between organizations.</p>
        <strong>Request Body:</strong>
        <pre>{
  "from": "org123",
  "to": "org456",
  "amount": 100,
  "price": 25.50
}</pre>
    </div>

    <div class="endpoint">
        <h3><span class="method">GET</span> <span class="path">/api/network/peers</span></h3>
        <p>Get list of connected peers.</p>
    </div>

    <div class="endpoint">
        <h3><span class="method">POST</span> <span class="path">/api/register</span></h3>
        <p>Register a third-party identity and receive authentication key.</p>
        <strong>Request Body:</strong>
        <pre>{
  "uuid": "user-unique-identifier"
}</pre>
        <strong>Response:</strong>
        <pre>{
  "key": "64-character-hexadecimal-key"
}</pre>
    </div>

    <div class="endpoint">
        <h3><span class="method">POST</span> <span class="path">/api/submit</span></h3>
        <p>Submit restoration data with authentication for peer validation.</p>
        <strong>Request Body:</strong>
        <pre>{
  "uuid": "user-unique-identifier",
  "key": "authentication-key-from-register",
  "data": {
    "organizationId": "org123",
    "location": {
      "latitude": 12.345,
      "longitude": 67.890
    },
    "area": 1000,
    "speciesData": [],
    "images": []
  }
}</pre>
    </div>

    <h2>WebSocket API</h2>
    <p>Connect to <code>ws://localhost:3001</code> for real-time blockchain events.</p>

    <h2>Authentication</h2>
    <p>The API supports third-party authentication through the /api/register and /api/submit endpoints. Dashboard submissions bypass validation, while API submissions require peer consensus.</p>
</body>
</html>`;
  }

  /**
   * Handle identity registration
   */
  async handleRegisterIdentity(req, res) {
    try {
      const body = await this.readRequestBody(req);
      const { uuid } = JSON.parse(body);

      if (!uuid) {
        this.sendError(res, 400, 'UUID is required');
        return;
      }

      // Generate random 64-character hexadecimal key
      const key = CryptoUtils.generateRandomHex(64);
      this.registeredIdentities.set(uuid, key);

      console.log(`[API] Registered identity: ${uuid}`);
      this.sendJSON(res, { key });

    } catch (error) {
      console.error('[API] Registration error:', error);
      this.sendError(res, 500, 'Registration failed');
    }
  }

  /**
   * Handle authenticated data submission
   */
  async handleSubmitWithAuth(req, res) {
    try {
      const body = await this.readRequestBody(req);
      const { uuid, key, data } = JSON.parse(body);

      if (!uuid || !key || !data) {
        this.sendError(res, 400, 'UUID, key, and data are required');
        return;
      }

      const config = await this.config.getAll();

      // Handle privileged UUID (dashboard submissions)
      if (uuid === config.privilegedUuid || uuid === 'DASHBOARD') {
        console.log(`[API] Privileged submission from ${uuid} - bypassing validation`);
        
        // Create transaction directly
        const transaction = Transaction.createRestoration({
          organizationId: data.organizationId,
          location: data.location,
          area: data.area,
          speciesData: data.speciesData || [],
          images: data.images || [],
          submittedBy: uuid,
          timestamp: data.timestamp || new Date().toISOString()
        });

        // Add directly to blockchain (no validation, no carbon credits)
        this.blockchain.addTransaction(transaction);
        
        this.sendJSON(res, { 
          success: true,
          transactionId: transaction.id,
          status: 'finalized',
          message: 'Dashboard submission added directly to blockchain (no validation, no carbon credits)'
        });
        return;
      }

      // Regular submissions - validate UUID+key combination
      const registeredKey = this.registeredIdentities.get(uuid);
      if (!registeredKey || registeredKey !== key) {
        this.sendError(res, 401, 'Invalid UUID/key combination');
        return;
      }

      // Create transaction for validation
      const transaction = Transaction.createRestoration({
        organizationId: data.organizationId,
        location: data.location,
        area: data.area,
        speciesData: data.speciesData || [],
        images: data.images || [],
        submittedBy: uuid,
        timestamp: data.timestamp || new Date().toISOString()
      });

      // Add to validation pool
      const peerAddress = req.connection.remoteAddress || 'localhost';
      const result = await this.validationPool.addTransaction(transaction, uuid, peerAddress);

      if (result.skipValidation) {
        // Privileged UUID processed directly
        this.blockchain.addTransaction(transaction);
        this.sendJSON(res, { 
          success: true,
          transactionId: result.transactionId,
          status: 'finalized',
          message: 'Privileged submission finalized immediately'
        });
      } else {
        // Regular submission for validation
        console.log(`[API] Data submitted for validation: ${result.transactionId} by ${uuid}`);
        this.sendJSON(res, { 
          transactionId: result.transactionId,
          status: 'submitted_for_validation',
          message: 'Data submitted and pending peer validation'
        });

        // Broadcast to peers for validation
        this.p2pServer.broadcastMessage({
          type: 'validation_request',
          transactionId: result.transactionId,
          transaction: transaction,
          submittedBy: uuid
        });
      }

    } catch (error) {
      console.error('[API] Submission error:', error);
      this.sendError(res, 500, 'Submission failed: ' + error.message);
    }
  }



  /**
   * Update validation pool with current peer and UUID counts
   */
  updateValidationPoolCounts() {
    // Update connected peers
    const connectedPeers = this.p2pServer.getConnectedPeers().map(p => p.address || p.id);
    this.validationPool.updateConnectedPeers(new Set(connectedPeers));

    // Update registered UUIDs
    const registeredUUIDs = Array.from(this.registeredIdentities.keys());
    this.validationPool.updateRegisteredUUIDs(new Set(registeredUUIDs));
  }

  /**
   * Handle new validation request from peer
   */
  async handleValidationRequest(ws, transactionId, transaction, submittedBy) {
    console.log(`[API] Received validation request for transaction ${transactionId} from ${submittedBy}`);
    
    // Add the submission to our validation pool
    const peerAddress = ws.remoteAddress || ws._socket.remoteAddress || 'unknown';
    
    try {
      await this.validationPool.addSubmission(transactionId, transaction, submittedBy, peerAddress);
    } catch (error) {
      console.error(`[API] Error adding validation submission: ${error.message}`);
    }
  }

  /**
   * Handle validation submission from peer
   */
  async handleValidationSubmission(transactionId, data, submittedBy, peerAddress) {
    console.log(`[API] Received validation submission for transaction ${transactionId} from ${submittedBy}`);
    
    try {
      await this.validationPool.addSubmission(transactionId, data, submittedBy, peerAddress);
    } catch (error) {
      console.error(`[API] Error processing validation submission: ${error.message}`);
    }
  }

  /**
   * Handle approved transaction from validation pool
   */
  handleTransactionApproved({ transactionId, transaction, firstSubmitter }) {
    console.log(`[API] Transaction ${transactionId} approved - finalizing to blockchain`);
    
    // Add transaction to blockchain
    this.blockchain.addTransaction(transaction);
    
    // Issue carbon credits to first submitter
    if (transaction.type === 'restoration') {
      const credits = this.carbonContract.calculateCarbonCredits(
        transaction.area,
        transaction.speciesData,
        transaction.location,
        transaction.images
      );
      
      if (credits > 0) {
        this.carbonContract.issueCarbonCredits(firstSubmitter, credits, transactionId);
        console.log(`[API] Issued ${credits} carbon credits to ${firstSubmitter}`);
      }
    }
    
    // Broadcast to peers that transaction is finalized
    this.p2pServer.broadcastMessage({
      type: 'transaction_finalized',
      transactionId,
      transaction,
      creditsIssued: true,
      recipient: firstSubmitter
    });
  }

  /**
   * Handle rejected transaction from validation pool
   */
  handleTransactionRejected({ transactionId, reason }) {
    console.log(`[API] Transaction ${transactionId} rejected: ${reason}`);
    
    // Broadcast rejection to peers
    this.p2pServer.broadcastMessage({
      type: 'transaction_rejected',
      transactionId,
      reason
    });
  }

  /**
   * Utility methods
   */
  async readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  sendJSON(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  sendError(res, code, message) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message, code }));
  }
}

// Start server if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new APIServer({
    port: process.env.PORT,
    p2pPort: process.env.P2P_PORT,
    dataDir: process.env.DATA_DIR
  });

  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default APIServer;
