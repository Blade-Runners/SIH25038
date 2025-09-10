#!/usr/bin/env node

import { Wallet } from '../src/user/Wallet.js';

class BlockchainClient {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
    this.sessionId = null;
    this.user = null;
  }

  async start() {
    console.log('🖥️  XBC Blockchain Client');
    console.log('========================');
    console.log('Welcome to the XBC Blockchain interactive client!');
    console.log('Type "help" for available commands.\n');

    await this.showMainMenu();
  }

  async showMainMenu() {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    while (true) {
      try {
        const command = await this.question(rl, '> ');
        const result = await this.processCommand(command.trim(), rl);
        
        if (result === 'EXIT') {
          break;
        }
      } catch (error) {
        console.error('❌ Error:', error.message);
      }
    }

    rl.close();
  }

  async processCommand(command, rl) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;

      case 'register':
        await this.register(rl);
        break;

      case 'login':
        await this.login(rl);
        break;

      case 'logout':
        await this.logout();
        break;

      case 'balance':
        await this.checkBalance(parts[1]);
        break;

      case 'send':
        await this.sendTransaction(rl);
        break;

      case 'mine':
        await this.mineBlock();
        break;

      case 'blockchain':
        await this.showBlockchain();
        break;

      case 'stats':
        await this.showStats();
        break;

      case 'peers':
        await this.showPeers();
        break;

      case 'users':
        await this.showUsers();
        break;

      case 'pending':
        await this.showPendingTransactions();
        break;

      case 'connect':
        await this.connectPeer(rl);
        break;

      case 'contract':
        await this.handleContract(parts.slice(1), rl);
        break;

      case 'clear':
        console.clear();
        break;

      case 'exit':
      case 'quit':
        console.log('👋 Goodbye!');
        return 'EXIT';

      case '':
        break;

      default:
        console.log(`❌ Unknown command: ${cmd}. Type "help" for available commands.`);
    }
  }

  showHelp() {
    console.log(`
📚 Available Commands:

Authentication:
  register          - Register a new user account
  login             - Login to existing account
  logout            - Logout from current session

Blockchain Operations:
  balance [address] - Check balance (your balance or specific address)
  send              - Send tokens to another address
  mine              - Mine a new block
  blockchain        - Show recent blocks
  stats             - Show blockchain statistics
  pending           - Show pending transactions

Network:
  peers             - Show connected peers
  connect           - Connect to a new peer
  users             - Show registered users

Smart Contracts:
  contract deploy   - Deploy a smart contract
  contract execute  - Execute a smart contract

Utility:
  help              - Show this help message
  clear             - Clear the screen
  exit/quit         - Exit the client
    `);
  }

  async register(rl) {
    const username = await this.question(rl, 'Username: ');
    const password = await this.question(rl, 'Password: ');

    try {
      const response = await fetch(`${this.serverUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Registration successful!');
        console.log(`📍 Your address: ${data.user.address}`);
      } else {
        console.error('❌ Registration failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async login(rl) {
    const username = await this.question(rl, 'Username: ');
    const password = await this.question(rl, 'Password: ');

    try {
      const response = await fetch(`${this.serverUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        this.sessionId = data.sessionId;
        this.user = data.user;
        console.log('✅ Login successful!');
        console.log(`👤 Welcome, ${this.user.username}!`);
        console.log(`📍 Your address: ${this.user.address}`);
      } else {
        console.error('❌ Login failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async logout() {
    if (!this.sessionId) {
      console.log('❌ Not logged in');
      return;
    }

    try {
      await fetch(`${this.serverUrl}/api/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.sessionId}` }
      });

      this.sessionId = null;
      this.user = null;
      console.log('✅ Logged out successfully');
    } catch (error) {
      console.error('❌ Logout error:', error.message);
    }
  }

  async checkBalance(address) {
    const targetAddress = address || (this.user ? this.user.address : null);
    
    if (!targetAddress) {
      console.log('❌ Please provide an address or login first');
      return;
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/balance?address=${targetAddress}`);
      const data = await response.json();

      if (response.ok) {
        console.log(`💰 Balance: ${data.balance} XBC`);
        console.log(`📍 Address: ${data.address}`);
      } else {
        console.error('❌ Failed to get balance:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async sendTransaction(rl) {
    if (!this.sessionId) {
      console.log('❌ Please login first');
      return;
    }

    const toAddress = await this.question(rl, 'Recipient address: ');
    const amount = parseFloat(await this.question(rl, 'Amount: '));

    if (!toAddress || !amount || amount <= 0) {
      console.log('❌ Invalid recipient address or amount');
      return;
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionId}`
        },
        body: JSON.stringify({ toAddress, amount })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Transaction sent successfully!');
        console.log(`💸 Sent ${amount} XBC to ${toAddress}`);
      } else {
        console.error('❌ Transaction failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async mineBlock() {
    if (!this.sessionId) {
      console.log('❌ Please login first');
      return;
    }

    console.log('⛏️  Mining block...');

    try {
      const response = await fetch(`${this.serverUrl}/api/mine`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.sessionId}` }
      });

      const data = await response.json();

      if (response.ok) {
        console.log('🎉 Block mined successfully!');
        console.log(`📦 Block #${data.block.index}`);
        console.log(`🔗 Hash: ${data.block.hash}`);
      } else {
        console.error('❌ Mining failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async showBlockchain() {
    try {
      const response = await fetch(`${this.serverUrl}/api/blockchain`);
      const blocks = await response.json();

      console.log('\n📦 Recent Blocks:');
      console.log('================');

      blocks.slice(-5).reverse().forEach(block => {
        console.log(`Block #${block.index}`);
        console.log(`  Hash: ${block.hash}`);
        console.log(`  Previous: ${block.previousHash}`);
        console.log(`  Transactions: ${block.transactions.length}`);
        console.log(`  Timestamp: ${new Date(block.timestamp).toLocaleString()}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async showStats() {
    try {
      const response = await fetch(`${this.serverUrl}/api/stats`);
      const stats = await response.json();

      console.log('\n📊 Blockchain Statistics:');
      console.log('========================');
      console.log(`Total Blocks: ${stats.totalBlocks}`);
      console.log(`Total Users: ${stats.totalUsers}`);
      console.log(`Active Peers: ${stats.totalPeers}`);
      console.log(`Pending Transactions: ${stats.pendingTransactions}`);
      console.log(`Mining Difficulty: ${stats.difficulty}`);
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async showPeers() {
    try {
      const response = await fetch(`${this.serverUrl}/api/peers`);
      const peers = await response.json();

      console.log('\n🌐 Connected Peers:');
      console.log('==================');

      if (peers.length === 0) {
        console.log('No connected peers');
      } else {
        peers.forEach(peer => {
          console.log(`${peer.host}:${peer.port} - ${peer.isConnected ? 'Connected' : 'Disconnected'}`);
        });
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async showUsers() {
    try {
      const response = await fetch(`${this.serverUrl}/api/users`);
      const users = await response.json();

      console.log('\n👥 Registered Users:');
      console.log('===================');

      users.slice(-10).forEach(user => {
        console.log(`${user.username} - ${user.address.substring(0, 20)}...`);
      });
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async showPendingTransactions() {
    try {
      const response = await fetch(`${this.serverUrl}/api/transactions/pending`);
      const transactions = await response.json();

      console.log('\n💸 Pending Transactions:');
      console.log('=======================');

      if (transactions.length === 0) {
        console.log('No pending transactions');
      } else {
        transactions.forEach(tx => {
          console.log(`${tx.amount} XBC from ${tx.fromAddress || 'Mining'} to ${tx.toAddress.substring(0, 20)}...`);
        });
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async connectPeer(rl) {
    const host = await this.question(rl, 'Peer host: ');
    const port = parseInt(await this.question(rl, 'Peer port: '));

    if (!host || !port) {
      console.log('❌ Invalid host or port');
      return;
    }

    try {
      const response = await fetch(`${this.serverUrl}/api/peers/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port })
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`✅ Connection initiated to ${host}:${port}`);
      } else {
        console.error('❌ Connection failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async handleContract(args, rl) {
    if (args[0] === 'deploy') {
      await this.deployContract(rl);
    } else if (args[0] === 'execute') {
      await this.executeContract(rl);
    } else {
      console.log('❌ Contract commands: deploy, execute');
    }
  }

  async deployContract(rl) {
    if (!this.sessionId) {
      console.log('❌ Please login first');
      return;
    }

    console.log('Enter your contract code (JavaScript function):');
    const code = await this.question(rl, 'Code: ');

    try {
      const response = await fetch(`${this.serverUrl}/api/contract/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionId}`
        },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Contract deployed successfully!');
        console.log(`📍 Contract address: ${data.contractAddress}`);
      } else {
        console.error('❌ Deployment failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  async executeContract(rl) {
    if (!this.sessionId) {
      console.log('❌ Please login first');
      return;
    }

    const contractAddress = await this.question(rl, 'Contract address: ');
    const method = await this.question(rl, 'Method: ');
    const params = await this.question(rl, 'Parameters (JSON): ');

    try {
      const parsedParams = params ? JSON.parse(params) : {};

      const response = await fetch(`${this.serverUrl}/api/contract/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionId}`
        },
        body: JSON.stringify({ contractAddress, method, params: parsedParams })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ Contract executed successfully!');
        console.log('📋 Result:', JSON.stringify(data.result, null, 2));
      } else {
        console.error('❌ Execution failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Network error:', error.message);
    }
  }

  question(rl, prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
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
XBC Blockchain Client

Usage: node scripts/client.js [options]

Options:
  --server <url>       Server URL (default: http://localhost:3000)
  --help, -h           Show this help message

Examples:
  node scripts/client.js
  node scripts/client.js --server http://localhost:3000
    `);
    process.exit(0);
  }
}

const client = new BlockchainClient(serverUrl);
client.start().catch(error => {
  console.error('❌ Failed to start client:', error.message);
  process.exit(1);
});
