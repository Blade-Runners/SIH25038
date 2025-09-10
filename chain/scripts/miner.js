#!/usr/bin/env node

import { Blockchain } from '../src/core/Blockchain.js';
import { UserManager } from '../src/user/UserManager.js';
import { Wallet } from '../src/user/Wallet.js';

class Miner {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.isRunning = false;
    this.miningInterval = null;
    this.username = null;
    this.sessionId = null;
    this.wallet = null;
  }

  async start() {
    console.log('⛏️  Starting XBC Miner...');
    console.log('========================');

    await this.setupMiner();

    console.log(`🏭 Miner started for user: ${this.username}`);
    console.log(`📍 Mining address: ${this.wallet.getAddress()}`);
    console.log('⛏️  Starting mining operations...');

    this.isRunning = true;
    this.startMining();
    this.setupGracefulShutdown();
  }

  async setupMiner() {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const envUsername = process.env.MINER_USERNAME;
    const envPassword = process.env.MINER_PASSWORD;

    if (envUsername && envPassword) {
      console.log('🔑 Using credentials from environment variables');
      this.username = envUsername;
      try {
        await this.login(envUsername, envPassword);
        rl.close();
        return;
      } catch (error) {
        console.log('❌ Environment credentials failed, falling back to interactive setup');
      }
    }

    console.log('🔑 Miner Authentication Required');
    console.log('You need to login with an existing account or create a new one.');

    const loginOrRegister = await this.question(rl, 'Do you want to (l)ogin or (r)egister? ');

    if (loginOrRegister.toLowerCase() === 'r') {
      await this.registerMiner(rl);
    } else {
      await this.loginMiner(rl);
    }

    rl.close();
  }

  async registerMiner(rl) {
    const username = await this.question(rl, 'Enter username: ');
    const password = await this.question(rl, 'Enter password: ');

    try {
      const response = await fetch(`${this.serverUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Registration successful! Now logging in...');
        this.username = username;
        await this.login(username, password);
      } else {
        throw new Error(data.error || 'Registration failed');
      }
    } catch (error) {
      console.error('❌ Registration failed:', error.message);
      process.exit(1);
    }
  }

  async loginMiner(rl) {
    const username = await this.question(rl, 'Enter username: ');
    const password = await this.question(rl, 'Enter password: ');

    this.username = username;
    await this.login(username, password);
  }

  async login(username, password) {
    try {
      const response = await fetch(`${this.serverUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.sessionId = data.sessionId;
        this.wallet = new Wallet();
        console.log('✅ Login successful!');
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      process.exit(1);
    }
  }

  question(rl, prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  startMining() {
    console.log('⛏️  Mining started...');
    this.miningInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.mineBlock();
      }
    }, 30000);
    setTimeout(() => this.mineBlock(), 1000);
  }

  async mineBlock() {
    try {
      console.log('⛏️  Attempting to mine a new block...');

      const response = await fetch(`${this.serverUrl}/api/mine`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.sessionId}` }
      });

      const data = await response.json();

      if (response.ok) {
        console.log('🎉 Block mined successfully!');
        console.log(`💰 Earned mining reward!`);
        console.log(`📦 Block #${data.block.index} - Hash: ${data.block.hash.substring(0, 20)}...`);
        await this.checkBalance();
      } else {
        console.log('⚠️  Mining failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Mining error:', error.message);
    }
  }

  async checkBalance() {
    try {
      const response = await fetch(`${this.serverUrl}/api/balance?address=${this.wallet.getAddress()}`);
      const data = await response.json();
      
      if (response.ok) {
        console.log(`💎 Current balance: ${data.balance} XBC`);
      }
    } catch (error) {
      console.error('Error checking balance:', error.message);
    }
  }

  setupGracefulShutdown() {
    const gracefulShutdown = (signal) => {
      console.log(`\n📡 Received ${signal}. Stopping miner...`);
      
      this.isRunning = false;
      if (this.miningInterval) {
        clearInterval(this.miningInterval);
      }
      
      console.log('✅ Miner stopped successfully');
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }
}

const args = process.argv.slice(2);
let serverUrl = 'http://localhost:3000';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--server' && args[i + 1]) {
    serverUrl = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
XBC Blockchain Miner

Usage: node scripts/miner.js [options]

Options:
  --server <url>       Server URL (default: http://localhost:3000)
  --help, -h           Show this help message

Environment Variables:
  MINER_USERNAME       Username for automatic login
  MINER_PASSWORD       Password for automatic login

Examples:
  node scripts/miner.js
  node scripts/miner.js --server http://localhost:3000
  MINER_USERNAME=miner1 MINER_PASSWORD=password123 node scripts/miner.js
    `);
    process.exit(0);
  }
}

const miner = new Miner(serverUrl);
miner.start().catch(error => {
  console.error('❌ Failed to start miner:', error.message);
  process.exit(1);
});
