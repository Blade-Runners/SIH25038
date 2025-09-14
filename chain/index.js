import { readFileSync } from 'fs';
import { BlockchainRegistry } from './src/blockchain.js';
import { P2PNetwork } from './src/p2p.js';
import { HTTPServer } from './src/server.js';

let config;
try {
  const configPath = process.env.CONFIG_FILE || './config.json';
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('Error loading config file:', error.message);
  process.exit(1);
}

const blockchain = new BlockchainRegistry(config);
const p2pNetwork = new P2PNetwork(config, blockchain);
const httpServer = new HTTPServer(config, blockchain, p2pNetwork);

blockchain.setP2PNetwork(p2pNetwork);

async function start() {
  try {
    console.log('Starting Blockchain Registry...');
    
    await blockchain.initialize();
    
    await p2pNetwork.start();
    
    await httpServer.start();
    
    console.log(`Blockchain Registry started successfully!`);
    console.log(`HTTP API: http://localhost:${config.port}`);
    console.log(`P2P Port: ${config.p2p}`);
    console.log(`Documentation: http://localhost:${config.port}/docs`);
    
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  httpServer.stop();
  p2pNetwork.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  httpServer.stop();
  p2pNetwork.stop();
  process.exit(0);
});

start();
