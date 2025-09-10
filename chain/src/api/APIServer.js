import http from 'http';
import { URL } from 'url';
import path from 'path';
import fs from 'fs';

export class APIServer {
  constructor(blockchain, userManager, p2pServer, port = 3000) {
    this.blockchain = blockchain;
    this.userManager = userManager;
    this.p2pServer = p2pServer;
    this.port = port;
    this.server = null;
  }

  start() {
    this.server = http.createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          this.handleRequest(req, res, body);
        } catch (error) {
          console.error('API Request error:', error.message);
          this.sendResponse(res, 500, { error: error.message });
        }
      });
    });

    this.server.listen(this.port, () => {
      console.log(`API Server listening on port ${this.port}`);
      console.log(`Dashboard available at: http://localhost:${this.port}`);
    });
  }

  handleRequest(req, res, body) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const path = url.pathname;
    const method = req.method;

    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      this.serveStaticFile(res, 'src/dashboard/index.html');
    } else if (method === 'GET' && path === '/dashboard.js') {
      this.serveStaticFile(res, 'src/dashboard/dashboard.js');
    } else if (method === 'GET' && path === '/style.css') {
      this.serveStaticFile(res, 'src/dashboard/style.css');
    }
    
    else if (path.startsWith('/api/')) {
      this.handleAPIRequest(req, res, body, path.substring(5), method);
    } else {
      this.sendResponse(res, 404, { error: 'Not found' });
    }
  }

  handleAPIRequest(req, res, body, apiPath, method) {
    try {
      const data = body ? JSON.parse(body) : {};
      const sessionId = req.headers.authorization?.replace('Bearer ', '');

      switch (`${method} ${apiPath}`) {
        case 'POST register':
          this.handleRegister(res, data);
          break;
        case 'POST login':
          this.handleLogin(res, data);
          break;
        case 'POST logout':
          this.handleLogout(res, sessionId);
          break;
        case 'GET blockchain':
          this.sendResponse(res, 200, this.blockchain.getAllBlocks());
          break;
        case 'GET stats':
          this.handleGetStats(res);
          break; 
        case 'GET balance':
          this.handleGetBalance(res, req);
          break;
        case 'POST transaction':
          this.handleCreateTransaction(res, data, sessionId);
          break;
        case 'GET transactions/pending':
          this.sendResponse(res, 200, this.blockchain.getPendingTransactions());
          break;
        case 'POST mine':
          this.handleMine(res, sessionId);
          break;
        case 'GET users':
          this.sendResponse(res, 200, this.userManager.getAllUsers());
          break;
        case 'GET user':
          this.handleGetUser(res, req);
          break;
        case 'GET peers':
          this.sendResponse(res, 200, this.p2pServer.getActivePeers());
          break;
        case 'POST peers/connect':
          this.handleConnectPeer(res, data);
          break;
        case 'POST contract/deploy':
          this.handleDeployContract(res, data, sessionId);
          break;
        case 'POST contract/execute':
          this.handleExecuteContract(res, data, sessionId);
          break;
        default:
          this.sendResponse(res, 404, { error: `API endpoint not found: ${method} ${apiPath}` });
      }
    } catch (error) {
      console.error('API Error:', error.message);
      this.sendResponse(res, 400, { error: error.message });
    }
  }

  handleRegister(res, data) {
    const { username, password } = data;
    const user = this.userManager.register(username, password);
    this.sendResponse(res, 201, { message: 'User registered successfully', user });
  }

  handleLogin(res, data) {
    const { username, password } = data;
    const result = this.userManager.login(username, password);
    this.sendResponse(res, 200, result);
  }

  handleLogout(res, sessionId) {
    const success = this.userManager.logout(sessionId);
    this.sendResponse(res, 200, { message: success ? 'Logged out successfully' : 'Session not found' });
  }

  handleGetStats(res) {
    const blockchainStats = this.blockchain.getStats();
    const stats = {
      ...blockchainStats,
      totalPeers: this.p2pServer.getActivePeers().length,
      serverUptime: process.uptime()
    };
    this.sendResponse(res, 200, stats);
  }

  handleGetBalance(res, req) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const address = url.searchParams.get('address');
    
    if (!address) {
      this.sendResponse(res, 400, { error: 'Address parameter required' });
      return;
    }

    const balance = this.blockchain.getBalanceOfAddress(address);
    this.sendResponse(res, 200, { address, balance });
  }

  handleCreateTransaction(res, data, sessionId) {
    const user = this.userManager.verifySession(sessionId);
    if (!user) {
      this.sendResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    const { toAddress, amount, data: txData } = data;
    const wallet = this.userManager.getUserWallet(user.username);

    if (!wallet) {
      this.sendResponse(res, 404, { error: 'Wallet not found' });
      return;
    }

    const transaction = {
      fromAddress: user.address,
      toAddress,
      amount,
      data: txData,
      timestamp: Date.now()
    };
    transaction.signature = wallet.signData(JSON.stringify(transaction));

    this.blockchain.createTransaction(transaction);
    
    this.p2pServer.broadcastToAllPeers({
      type: 'NEW_TRANSACTION',
      data: { transaction }
    });

    this.sendResponse(res, 200, { message: 'Transaction created successfully', transaction });
  }

  handleMine(res, sessionId) {
    const user = this.userManager.verifySession(sessionId);
    if (!user) {
      this.sendResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      this.blockchain.minePendingTransactions(user.address);
      
      this.p2pServer.broadcastToAllPeers({
        type: 'NEW_BLOCK',
        data: { chain: this.blockchain.getAllBlocks() }
      });

      this.sendResponse(res, 200, { 
        message: 'Block mined successfully',
        block: this.blockchain.getLatestBlock()
      });
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  handleGetUser(res, req) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const username = url.searchParams.get('username');
    
    if (!username) {
      this.sendResponse(res, 400, { error: 'Username parameter required' });
      return;
    }

    const user = this.userManager.getUser(username);
    if (!user) {
      this.sendResponse(res, 404, { error: 'User not found' });
      return;
    }

    this.sendResponse(res, 200, user);
  }

  handleConnectPeer(res, data) {
    const { host, port } = data;
    this.p2pServer.addPeer(host, port);
    this.sendResponse(res, 200, { message: 'Peer connection initiated' });
  }

  handleDeployContract(res, data, sessionId) {
    const user = this.userManager.verifySession(sessionId);
    if (!user) {
      this.sendResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    const { code } = data;
    const contractAddress = this.blockchain.deployContract(code, user.address);
    
    this.sendResponse(res, 200, { 
      message: 'Contract deployed successfully',
      contractAddress 
    });
  }

  handleExecuteContract(res, data, sessionId) {
    const user = this.userManager.verifySession(sessionId);
    if (!user) {
      this.sendResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    const { contractAddress, method, params } = data;
    
    try {
      const result = this.blockchain.executeContract(contractAddress, method, params, user.address);
      this.sendResponse(res, 200, { result });
    } catch (error) {
      this.sendResponse(res, 400, { error: error.message });
    }
  }

  serveStaticFile(res, filePath) {
    try {
      const fullPath = path.resolve(filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      let contentType = 'text/html';
      if (filePath.endsWith('.js')) {
        contentType = 'application/javascript';
      } else if (filePath.endsWith('.css')) {
        contentType = 'text/css';
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      this.sendResponse(res, 404, { error: 'File not found' });
    }
  }

  sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('API Server stopped');
    }
  }
}
