#!/usr/bin/env node

import { Blockchain } from '../src/core/Blockchain.js';
import { Block } from '../src/core/Block.js';
import { Transaction } from '../src/core/Transaction.js';
import { UserManager } from '../src/user/UserManager.js';
import { Wallet } from '../src/user/Wallet.js';

class BlockchainTest {
  constructor() {
    this.testResults = [];
  }

  log(message, isSuccess = true) {
    const status = isSuccess ? '✅' : '❌';
    console.log(`${status} ${message}`);
    this.testResults.push({ message, isSuccess });
  }

  async runTests() {
    console.log('🧪 Running XBC Blockchain Tests');
    console.log('===============================\n');

    await this.testBlockCreation();
    await this.testBlockchain();
    await this.testUserManager();
    await this.testWallet();
    await this.testTransactions();
    await this.testMining();
    await this.testSmartContracts();

    this.showSummary();
  }

  async testBlockCreation() {
    console.log('📦 Testing Block Creation...');
    
    try {
      const transactions = [];
      const block = new Block(1, 'previousHash', Date.now(), transactions);
      
      this.log('Block creation successful');
      this.log(`Block hash generated: ${block.hash.length === 128}`, block.hash.length === 128);
      this.log(`Block has valid structure: ${block.index === 1}`, block.index === 1);
    } catch (error) {
      this.log(`Block creation failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  async testBlockchain() {
    console.log('⛓️  Testing Blockchain...');
    
    try {
      const blockchain = new Blockchain();
      
      this.log('Blockchain initialization successful');
      this.log(`Genesis block created: ${blockchain.chain.length === 1}`, blockchain.chain.length === 1);
      this.log(`Chain is valid: ${blockchain.isChainValid()}`, blockchain.isChainValid());
      
      const stats = blockchain.getStats();
      this.log(`Stats retrieved: ${stats.totalBlocks === 1}`, stats.totalBlocks === 1);
      
    } catch (error) {
      this.log(`Blockchain test failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  async testUserManager() {
    console.log('👤 Testing User Manager...');
    
    try {
      const userManager = new UserManager();
      
      const user = userManager.register('testuser', 'password123');
      this.log('User registration successful');
      this.log(`User has address: ${user.address.length > 0}`, user.address.length > 0);
      
      const loginResult = userManager.login('testuser', 'password123');
      this.log('User login successful');
      this.log(`Session created: ${loginResult.sessionId.length > 0}`, loginResult.sessionId.length > 0);
      
      const sessionUser = userManager.verifySession(loginResult.sessionId);
      this.log(`Session verification: ${sessionUser !== null}`, sessionUser !== null);
      
      const logoutResult = userManager.logout(loginResult.sessionId);
      this.log(`Logout successful: ${logoutResult}`, logoutResult);
      
    } catch (error) {
      this.log(`User manager test failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  async testWallet() {
    console.log('💰 Testing Wallet...');
    
    try {
      const wallet = new Wallet();
      
      this.log('Wallet creation successful');
      this.log(`Address generated: ${wallet.getAddress().length > 0}`, wallet.getAddress().length > 0);
      this.log(`Public key exists: ${wallet.getPublicKey().length > 0}`, wallet.getPublicKey().length > 0);
      this.log(`Private key exists: ${wallet.getPrivateKey().length > 0}`, wallet.getPrivateKey().length > 0);
      
      const data = 'test data';
      const signature = wallet.signData(data);
      this.log(`Data signing works: ${signature.length > 0}`, signature.length > 0);
      
    } catch (error) {
      this.log(`Wallet test failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  async testTransactions() {
    console.log('💸 Testing Transactions...');
    
    try {
      const wallet1 = new Wallet();
      const wallet2 = new Wallet();
      
      const transaction = new Transaction(
        wallet1.getAddress(),
        wallet2.getAddress(),
        100
      );
      
      this.log('Transaction creation successful');
      this.log(`Transaction hash generated: ${transaction.calculateHash().length === 128}`, 
                transaction.calculateHash().length === 128);
      
    } catch (error) {
      this.log(`Transaction test failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  async testMining() {
    console.log('⛏️  Testing Mining...');
    
    try {
      const blockchain = new Blockchain();
      const wallet = new Wallet();
      
      const transaction = new Transaction(null, wallet.getAddress(), 100);
      blockchain.createTransaction(transaction);
      
      blockchain.minePendingTransactions(wallet.getAddress());
      
      this.log('Block mining successful');
      this.log(`Chain length increased: ${blockchain.chain.length === 2}`, blockchain.chain.length === 2);
      this.log(`Miner received reward: ${blockchain.getBalanceOfAddress(wallet.getAddress()) > 0}`,
                blockchain.getBalanceOfAddress(wallet.getAddress()) > 0);
      
    } catch (error) {
      this.log(`Mining test failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  async testSmartContracts() {
    console.log('📜 Testing Smart Contracts...');
    
    try {
      const blockchain = new Blockchain();
      const wallet = new Wallet();
      
      const contractCode = `
        if (!storage.counter) storage.counter = 0;
        if (params.action === 'increment') {
          storage.counter++;
          return { counter: storage.counter };
        }
        return { counter: storage.counter };
      `;
      
      const contractAddress = blockchain.deployContract(contractCode, wallet.getAddress());
      this.log('Smart contract deployment successful');
      this.log(`Contract address generated: ${contractAddress.length > 0}`, contractAddress.length > 0);
      
      const result = blockchain.executeContract(
        contractAddress, 
        'increment', 
        { action: 'increment' }, 
        wallet.getAddress()
      );
      
      this.log(`Contract execution successful: ${result.counter === 1}`, result.counter === 1);
      
    } catch (error) {
      this.log(`Smart contract test failed: ${error.message}`, false);
    }
    
    console.log('');
  }

  showSummary() {
    console.log('📊 Test Summary');
    console.log('===============');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(test => test.isSuccess).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(test => !test.isSuccess)
        .forEach(test => console.log(`  - ${test.message}`));
    }
    
    console.log('\n' + (failedTests === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed.'));
  }
}

const tester = new BlockchainTest();
tester.runTests().catch(error => {
  console.error('❌ Test runner failed:', error.message);
  process.exit(1);
});
