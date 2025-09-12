/**
 * P2P WebSocket Server for Blue Carbon MRV network
 * Handles bidirectional peer connections and dense network topology
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import CryptoUtils from '../crypto/crypto-utils.js';

export class P2PServer extends EventEmitter {
  constructor(port = 3001, nodeId = null) {
    super();
    this.port = port;
    this.nodeId = nodeId || CryptoUtils.generateId();
    this.server = null;
    this.peers = new Map(); // peerId -> {ws, info, lastSeen}
    this.connections = new Map(); // ws -> peerId
    this.isRunning = false;
    this.messageHandlers = new Map();
    this.heartbeatInterval = null;
    this.syncInterval = null;
    
    // Network statistics
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      connectionsTotal: 0,
      connectionsActive: 0,
      bytesReceived: 0,
      bytesSent: 0,
      startTime: null
    };

    this.setupMessageHandlers();
  }

  /**
   * Start P2P server
   */
  async start() {
    if (this.isRunning) return;

    try {
      this.server = new WebSocketServer({ 
        port: this.port,
        perMessageDeflate: true,
        maxPayload: 1024 * 1024 // 1MB max message size
      });

      this.server.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      this.server.on('error', (error) => {
        console.error(`[P2P] Server error:`, error);
        this.emit('error', error);
      });

      this.isRunning = true;
      this.stats.startTime = new Date().toISOString();

      // Start heartbeat mechanism
      this.startHeartbeat();

      console.log(`[P2P] Server started on port ${this.port}, Node ID: ${this.nodeId}`);
      this.emit('server_started', { port: this.port, nodeId: this.nodeId });

    } catch (error) {
      console.error(`[P2P] Failed to start server:`, error);
      throw error;
    }
  }

  /**
   * Stop P2P server
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Close all peer connections
    for (const [peerId, peerInfo] of this.peers) {
      if (peerInfo.ws && peerInfo.ws.readyState === WebSocket.OPEN) {
        peerInfo.ws.close();
      }
    }

    this.peers.clear();
    this.connections.clear();

    // Close server
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
      this.server = null;
    }

    console.log(`[P2P] Server stopped`);
    this.emit('server_stopped');
  }

  /**
   * Handle new WebSocket connection
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} req - HTTP request object
   */
  handleConnection(ws, req) {
    const remoteAddress = req.socket.remoteAddress;
    console.log(`[P2P] New connection from ${remoteAddress}`);

    this.stats.connectionsTotal++;
    this.stats.connectionsActive++;

    // Set up WebSocket event handlers
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(ws, code, reason);
    });

    ws.on('error', (error) => {
      console.error(`[P2P] WebSocket error:`, error);
    });

    ws.on('pong', () => {
      // Update last seen time for heartbeat
      const peerId = this.connections.get(ws);
      if (peerId && this.peers.has(peerId)) {
        this.peers.get(peerId).lastSeen = Date.now();
      }
    });

    // Send handshake request
    this.sendMessage(ws, {
      type: 'handshake_request',
      nodeId: this.nodeId,
      timestamp: CryptoUtils.getTimestamp()
    });
  }

  /**
   * Handle WebSocket message
   * @param {WebSocket} ws - WebSocket connection
   * @param {Buffer} data - Message data
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      this.stats.messagesReceived++;
      this.stats.bytesReceived += data.length;

      // Validate message structure
      if (!message.type) {
        console.warn(`[P2P] Received message without type`);
        return;
      }

      // Handle message based on type
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(ws, message);
      } else {
        console.warn(`[P2P] Unknown message type: ${message.type}`);
      }

      this.emit('message_received', { ws, message });

    } catch (error) {
      console.error(`[P2P] Error handling message:`, error);
    }
  }

  /**
   * Handle WebSocket disconnection
   * @param {WebSocket} ws - WebSocket connection
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   */
  handleDisconnection(ws, code, reason) {
    const peerId = this.connections.get(ws);
    
    if (peerId) {
      console.log(`[P2P] Peer disconnected: ${peerId} (${code}: ${reason})`);
      this.peers.delete(peerId);
      this.connections.delete(ws);
      this.emit('peer_disconnected', { peerId, code, reason });
    }

    this.stats.connectionsActive--;
  }

  /**
   * Set up message handlers
   */
  setupMessageHandlers() {
    this.messageHandlers.set('handshake_request', this.handleHandshakeRequest.bind(this));
    this.messageHandlers.set('handshake_response', this.handleHandshakeResponse.bind(this));
    this.messageHandlers.set('peer_info', this.handlePeerInfo.bind(this));
    this.messageHandlers.set('blockchain_sync_request', this.handleBlockchainSyncRequest.bind(this));
    this.messageHandlers.set('blockchain_sync_response', this.handleBlockchainSyncResponse.bind(this));
    this.messageHandlers.set('new_block', this.handleNewBlock.bind(this));
    this.messageHandlers.set('new_transaction', this.handleNewTransaction.bind(this));
    this.messageHandlers.set('peer_list', this.handlePeerList.bind(this));
    this.messageHandlers.set('validation_request', this.handleValidationRequest.bind(this));
    this.messageHandlers.set('validation_vote', this.handleValidationVote.bind(this));
  }

  /**
   * Handle handshake request
   */
  handleHandshakeRequest(ws, message) {
    const peerId = message.nodeId;
    
    // Register peer
    this.peers.set(peerId, {
      ws,
      info: {
        nodeId: peerId,
        connectedAt: CryptoUtils.getTimestamp(),
        version: message.version || '1.0.0',
        capabilities: message.capabilities || []
      },
      lastSeen: Date.now()
    });

    this.connections.set(ws, peerId);

    // Send handshake response
    this.sendMessage(ws, {
      type: 'handshake_response',
      nodeId: this.nodeId,
      timestamp: CryptoUtils.getTimestamp(),
      version: '1.0.0',
      capabilities: ['blockchain_sync', 'transaction_relay', 'peer_discovery']
    });

    console.log(`[P2P] Peer registered: ${peerId}`);
    this.emit('peer_connected', { peerId, info: this.peers.get(peerId).info });

    // Share peer list
    this.broadcastPeerList();
  }

  /**
   * Handle handshake response
   */
  handleHandshakeResponse(ws, message) {
    const peerId = message.nodeId;
    
    if (this.connections.has(ws)) {
      // Update existing peer info
      const existingPeerId = this.connections.get(ws);
      const peerInfo = this.peers.get(existingPeerId);
      if (peerInfo) {
        peerInfo.info.version = message.version;
        peerInfo.info.capabilities = message.capabilities;
        peerInfo.lastSeen = Date.now();
      }
    }

    console.log(`[P2P] Handshake completed with ${peerId}`);
  }

  /**
   * Handle peer info update
   */
  handlePeerInfo(ws, message) {
    const peerId = this.connections.get(ws);
    if (peerId && this.peers.has(peerId)) {
      this.peers.get(peerId).info = { ...this.peers.get(peerId).info, ...message.info };
      this.peers.get(peerId).lastSeen = Date.now();
    }
  }

  /**
   * Handle blockchain sync request
   */
  handleBlockchainSyncRequest(ws, message) {
    this.emit('sync_request', { ws, request: message });
  }

  /**
   * Handle blockchain sync response
   */
  handleBlockchainSyncResponse(ws, message) {
    this.emit('sync_response', { ws, response: message });
  }

  /**
   * Handle new block broadcast
   */
  handleNewBlock(ws, message) {
    this.emit('new_block', { ws, block: message.block });
  }

  /**
   * Handle new transaction broadcast
   */
  handleNewTransaction(ws, message) {
    this.emit('new_transaction', { ws, transaction: message.transaction });
  }

  /**
   * Handle peer list update
   */
  handlePeerList(ws, message) {
    this.emit('peer_list_received', { ws, peers: message.peers });
  }

  /**
   * Handle validation request
   */
  handleValidationRequest(ws, message) {
    this.emit('validation_request', {
      ws,
      transactionId: message.transactionId,
      data: message.data,
      submittedBy: message.submittedBy
    });
  }

  /**
   * Handle validation vote
   */
  handleValidationVote(ws, message) {
    this.emit('validation_vote', {
      ws,
      transactionId: message.transactionId,
      vote: message.vote,
      peerId: this.connections.get(ws)
    });
  }

  /**
   * Send message to WebSocket
   * @param {WebSocket} ws - WebSocket connection
   * @param {Object} message - Message to send
   */
  sendMessage(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const data = JSON.stringify(message);
      ws.send(data);
      
      this.stats.messagesSent++;
      this.stats.bytesSent += data.length;
      
      return true;
    } catch (error) {
      console.error(`[P2P] Error sending message:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all connected peers
   * @param {Object} message - Message to broadcast
   * @param {string} excludePeerId - Peer ID to exclude from broadcast
   */
  broadcastMessage(message, excludePeerId = null) {
    let successCount = 0;
    
    for (const [peerId, peerInfo] of this.peers) {
      if (peerId !== excludePeerId && peerInfo.ws.readyState === WebSocket.OPEN) {
        if (this.sendMessage(peerInfo.ws, message)) {
          successCount++;
        }
      }
    }

    return successCount;
  }

  /**
   * Broadcast new block to network
   * @param {Object} block - Block to broadcast
   */
  broadcastBlock(block) {
    return this.broadcastMessage({
      type: 'new_block',
      block: block,
      timestamp: CryptoUtils.getTimestamp()
    });
  }

  /**
   * Broadcast new transaction to network
   * @param {Object} transaction - Transaction to broadcast
   */
  broadcastTransaction(transaction) {
    return this.broadcastMessage({
      type: 'new_transaction',
      transaction: transaction,
      timestamp: CryptoUtils.getTimestamp()
    });
  }

  /**
   * Broadcast peer list to network
   */
  broadcastPeerList() {
    const peerList = Array.from(this.peers.values()).map(peer => ({
      nodeId: peer.info.nodeId,
      connectedAt: peer.info.connectedAt,
      version: peer.info.version,
      capabilities: peer.info.capabilities
    }));

    return this.broadcastMessage({
      type: 'peer_list',
      peers: peerList,
      timestamp: CryptoUtils.getTimestamp()
    });
  }

  /**
   * Broadcast validation vote
   * @param {string} transactionId - Transaction being voted on
   * @param {string} vote - Vote (approve/reject)
   */
  broadcastValidationVote(transactionId, vote) {
    return this.broadcastMessage({
      type: 'validation_vote',
      transactionId,
      vote,
      peerId: this.nodeId,
      timestamp: CryptoUtils.getTimestamp()
    });
  }

  /**
   * Connect to remote peer
   * @param {string} address - Peer address (host:port)
   * @returns {Promise<boolean>} Connection success
   */
  async connectToPeer(address) {
    if (!this.isRunning) {
      throw new Error('P2P server not running');
    }

    try {
      const ws = new WebSocket(`ws://${address}`);
      
      return new Promise((resolve, reject) => {
        ws.on('open', () => {
          console.log(`[P2P] Connected to peer: ${address}`);
          
          // Send handshake
          this.sendMessage(ws, {
            type: 'handshake_request',
            nodeId: this.nodeId,
            timestamp: CryptoUtils.getTimestamp(),
            version: '1.0.0',
            capabilities: ['blockchain_sync', 'transaction_relay', 'peer_discovery']
          });
          
          resolve(true);
        });

        ws.on('message', (data) => {
          this.handleMessage(ws, data);
        });

        ws.on('close', (code, reason) => {
          this.handleDisconnection(ws, code, reason);
        });

        ws.on('error', (error) => {
          console.error(`[P2P] Connection error to ${address}:`, error);
          reject(error);
        });
      });

    } catch (error) {
      console.error(`[P2P] Failed to connect to ${address}:`, error);
      return false;
    }
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds timeout

      // Send ping to all peers and check for timeouts
      for (const [peerId, peerInfo] of this.peers) {
        if (now - peerInfo.lastSeen > timeout) {
          // Peer timeout - disconnect
          console.log(`[P2P] Peer timeout: ${peerId}`);
          if (peerInfo.ws.readyState === WebSocket.OPEN) {
            peerInfo.ws.close();
          }
        } else if (peerInfo.ws.readyState === WebSocket.OPEN) {
          // Send ping
          peerInfo.ws.ping();
        }
      }
    }, 15000); // Check every 15 seconds
  }

  /**
   * Get connected peers
   * @returns {Array} List of connected peers
   */
  getConnectedPeers() {
    return Array.from(this.peers.entries()).map(([peerId, peerInfo]) => ({
      peerId,
      info: peerInfo.info,
      lastSeen: new Date(peerInfo.lastSeen).toISOString(),
      connected: peerInfo.ws.readyState === WebSocket.OPEN
    }));
  }

  /**
   * Get network statistics
   * @returns {Object} Network statistics
   */
  getNetworkStats() {
    const uptime = this.stats.startTime ? 
      Date.now() - new Date(this.stats.startTime).getTime() : 0;

    return {
      ...this.stats,
      uptime,
      peersConnected: this.peers.size,
      messagesPerSecond: this.stats.messagesReceived / (uptime / 1000) || 0,
      bytesPerSecond: this.stats.bytesReceived / (uptime / 1000) || 0
    };
  }

  /**
   * Request blockchain sync from peers
   * @param {number} fromBlock - Starting block index
   */
  requestBlockchainSync(fromBlock = 0) {
    return this.broadcastMessage({
      type: 'blockchain_sync_request',
      fromBlock,
      timestamp: CryptoUtils.getTimestamp()
    });
  }

  /**
   * Send blockchain sync response
   * @param {WebSocket} ws - Target WebSocket
   * @param {Array} blocks - Blocks to send
   */
  sendBlockchainSync(ws, blocks) {
    return this.sendMessage(ws, {
      type: 'blockchain_sync_response',
      blocks,
      timestamp: CryptoUtils.getTimestamp()
    });
  }
}

export default P2PServer;