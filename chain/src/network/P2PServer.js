import http from 'http';
import { URL } from 'url';
import { Peer } from './Peer.js';

export class P2PServer {
  constructor(blockchain, port = 3001) {
    this.blockchain = blockchain;
    this.port = port;
    this.peers = new Map();
    this.server = null;
    this.messageHandlers = new Map();
    
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    this.messageHandlers.set('GET_BLOCKCHAIN', this.handleGetBlockchain.bind(this));
    this.messageHandlers.set('NEW_BLOCK', this.handleNewBlock.bind(this));
    this.messageHandlers.set('NEW_TRANSACTION', this.handleNewTransaction.bind(this));
    this.messageHandlers.set('PEER_LIST', this.handlePeerList.bind(this));
    this.messageHandlers.set('PING', this.handlePing.bind(this));
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
          console.error('P2P Request error:', error.message);
          this.sendResponse(res, 500, { error: error.message });
        }
      });
    });

    this.server.listen(this.port, () => {
      console.log(`P2P Server listening on port ${this.port}`);
    });
    this.startPeerMaintenance();
  }

  handleRequest(req, res, body) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/peers') {
      this.sendResponse(res, 200, Array.from(this.peers.values()).map(p => p.toJSON()));
    } else if (req.method === 'POST' && path === '/message') {
      const message = JSON.parse(body);
      this.handleMessage(message, req, res);
    } else if (req.method === 'POST' && path === '/connect') {
      const { host, port } = JSON.parse(body);
      this.connectToPeer(host, port);
      this.sendResponse(res, 200, { message: 'Connection attempt initiated' });
    } else {
      this.sendResponse(res, 404, { error: 'Not found' });
    }
  }

  handleMessage(message, req, res) {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      const response = handler(message.data);
      this.sendResponse(res, 200, response);
    } else {
      this.sendResponse(res, 400, { error: 'Unknown message type' });
    }
  }

  handleGetBlockchain(data) {
    return {
      type: 'BLOCKCHAIN',
      data: this.blockchain.getAllBlocks()
    };
  }

  handleNewBlock(data) {
    try {
      const newChain = data.chain;
      if (this.blockchain.replaceChain(newChain)) {
        console.log('Blockchain updated from peer');
        this.broadcastToAllPeers({
          type: 'NEW_BLOCK',
          data: { chain: newChain }
        });
      }
      return { message: 'Block processed' };
    } catch (error) {
      return { error: error.message };
    }
  }

  handleNewTransaction(data) {
    try {
      this.blockchain.createTransaction(data.transaction);
      console.log('New transaction received from peer');
      return { message: 'Transaction added to pending pool' };
    } catch (error) {
      return { error: error.message };
    }
  }

  handlePeerList(data) {
    data.peers.forEach(peerData => {
      if (!this.peers.has(peerData.id)) {
        this.addPeer(peerData.host, peerData.port);
      }
    });
    return { message: 'Peer list processed' };
  }

  handlePing(data) {
    return { type: 'PONG', timestamp: Date.now() };
  }

  addPeer(host, port) {
    const peerId = `${host}:${port}`;
    if (!this.peers.has(peerId) && peerId !== `localhost:${this.port}`) {
      const peer = new Peer(host, port);
      this.peers.set(peerId, peer);
      console.log(`Added peer: ${peerId}`);
      
      this.connectToPeer(host, port);
    }
  }

  removePeer(peerId) {
    if (this.peers.has(peerId)) {
      this.peers.delete(peerId);
      console.log(`Removed peer: ${peerId}`);
    }
  }

  connectToPeer(host, port) {
    const peerId = `${host}:${port}`;
    const peer = this.peers.get(peerId);
    
    if (!peer) {
      this.addPeer(host, port);
      return;
    }

    this.sendMessageToPeer(peer, {
      type: 'PING',
      data: { timestamp: Date.now() }
    }).then(() => {
      peer.isConnected = true;
      peer.updateLastSeen();
    }).catch(error => {
      console.log(`Failed to connect to peer ${peerId}: ${error.message}`);
      peer.isConnected = false;
    });
  }

  async sendMessageToPeer(peer, message) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(message);
      
      const options = {
        hostname: peer.host,
        port: peer.port,
        path: '/message',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  broadcastToAllPeers(message) {
    const activePeers = Array.from(this.peers.values()).filter(peer => peer.isActive());
    
    activePeers.forEach(async (peer) => {
      try {
        await this.sendMessageToPeer(peer, message);
        peer.updateLastSeen();
      } catch (error) {
        console.log(`Failed to send message to ${peer.id}: ${error.message}`);
        peer.isConnected = false;
      }
    });
  }

  syncWithPeer(peer) {
    this.sendMessageToPeer(peer, {
      type: 'GET_BLOCKCHAIN',
      data: {}
    }).then(response => {
      if (response.type === 'BLOCKCHAIN') {
        this.blockchain.replaceChain(response.data);
      }
    }).catch(error => {
      console.log(`Sync failed with peer ${peer.id}: ${error.message}`);
    });
  }

  startPeerMaintenance() {
    setInterval(() => {
      const inactivePeers = Array.from(this.peers.values()).filter(peer => !peer.isActive());
      inactivePeers.forEach(peer => this.removePeer(peer.id));

      const activePeers = Array.from(this.peers.values()).filter(peer => peer.isActive());
      activePeers.forEach(peer => {
        this.sendMessageToPeer(peer, {
          type: 'PING',
          data: { timestamp: Date.now() }
        }).then(() => {
          peer.updateLastSeen();
          peer.isConnected = true;
        }).catch(() => {
          peer.isConnected = false;
        });
      });

      console.log(`Active peers: ${activePeers.length}`);
    }, 30000);
  }

  sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  getActivePeers() {
    return Array.from(this.peers.values())
      .filter(peer => peer.isActive())
      .map(peer => peer.toJSON());
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('P2P Server stopped');
    }
  }
}
