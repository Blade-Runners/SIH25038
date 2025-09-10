#!/usr/bin/env node

import { Blockchain } from '../src/core/Blockchain.js';
import { UserManager } from '../src/user/UserManager.js';
import { P2PServer } from '../src/network/P2PServer.js';
import { APIServer } from '../src/api/APIServer.js';

class BlockchainNode {
  constructor(apiPort = 3000, p2pPort = 3001) {
    this.apiPort = apiPort;
    this.p2pPort = p2pPort;
    
    this.blockchain = new Blockchain();
    this.userManager = new UserManager();
    this.p2pServer = new P2PServer(this.blockchain, this.p2pPort);
    this.apiServer = new APIServer(this.blockchain, this.userManager, this.p2pServer, this.apiPort);
  }

  start() {
    console.log('🚀 Starting XBC Blockchain Node...');
    console.log('=====================================');
    
    this.p2pServer.start();
    
    this.apiServer.start();
    
    console.log('=====================================');
    console.log(`📡 P2P Server: http://localhost:${this.p2pPort}`);
    console.log(`🌐 API Server: http://localhost:${this.apiPort}`);
    console.log(`📊 Dashboard: http://localhost:${this.apiPort}`);
    console.log('=====================================');
    console.log('✅ Blockchain node started successfully!');
    console.log('🔗 Node is ready to accept connections and mine blocks');
    
    this.setupGracefulShutdown();
    
    this.connectToBootstrapPeers();
  }

  connectToBootstrapPeers() {
    const bootstrapPeers = process.env.BOOTSTRAP_PEERS;
    if (bootstrapPeers) {
      const peers = bootstrapPeers.split(',');
      console.log(`🔄 Connecting to bootstrap peers: ${peers.join(', ')}`);
      
      peers.forEach(peer => {
        const [host, port] = peer.trim().split(':');
        if (host && port) {
          setTimeout(() => {
            this.p2pServer.addPeer(host, parseInt(port));
          }, 2000);
        }
      });
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = (signal) => {
      console.log(`\n📡 Received ${signal}. Shutting down gracefully...`);
      
      this.apiServer.stop();
      this.p2pServer.stop();
      
      console.log('✅ Blockchain node stopped successfully');
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }
}

const args = process.argv.slice(2);
let apiPort = 3000;
let p2pPort = 3001;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-port' && args[i + 1]) {
    apiPort = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--p2p-port' && args[i + 1]) {
    p2pPort = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
XBC Blockchain Server

Usage: node scripts/server.js [options]

Options:
  --api-port <port>    API server port (default: 3000)
  --p2p-port <port>    P2P server port (default: 3001)
  --help, -h           Show this help message

Environment Variables:
  BOOTSTRAP_PEERS      Comma-separated list of peers to connect to (host:port,host:port)

Examples:
  node scripts/server.js
  node scripts/server.js --api-port 3000 --p2p-port 3001
  BOOTSTRAP_PEERS=localhost:3002,localhost:3003 node scripts/server.js
    `);
    process.exit(0);
  }
}

const node = new BlockchainNode(apiPort, p2pPort);
node.start();
