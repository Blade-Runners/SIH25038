import crypto from 'crypto';
import { Block } from './Block.js';
import { Transaction } from './Transaction.js';

export class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.difficulty = 2;
    this.pendingTransactions = [];
    this.miningReward = 100;
    this.totalSupply = 1000000;
    this.users = new Map();
    this.balances = new Map();
    this.smartContracts = new Map();
  }

  createGenesisBlock() {
    const genesisTransactions = [];
    return new Block(0, '0', Date.now(), genesisTransactions, 0);
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  minePendingTransactions(miningRewardAddress) {
    const rewardTx = new Transaction(null, miningRewardAddress, this.miningReward);
    this.pendingTransactions.push(rewardTx);

    const block = new Block(
      this.getLatestBlock().index + 1,
      this.getLatestBlock().hash,
      Date.now(),
      this.pendingTransactions
    );

    block.mineBlock(this.difficulty);
    
    console.log('Block successfully mined!');
    this.chain.push(block);
    this.updateBalances(block);
    
    this.pendingTransactions = [];
  }

  updateBalances(block) {
    for (const tx of block.transactions) {
      if (tx.fromAddress) {
        const fromBalance = this.balances.get(tx.fromAddress) || 0;
        this.balances.set(tx.fromAddress, fromBalance - tx.amount);
      }
      
      if (tx.toAddress) {
        const toBalance = this.balances.get(tx.toAddress) || 0;
        this.balances.set(tx.toAddress, toBalance + tx.amount);
      }
    }
  }

  createTransaction(transaction) {
    if (!transaction.isValid()) {
      throw new Error('Cannot add invalid transaction to chain');
    }
    if (transaction.fromAddress && this.getBalanceOfAddress(transaction.fromAddress) < transaction.amount) {
      throw new Error('Not enough balance');
    }

    this.pendingTransactions.push(transaction);
  }

  getBalanceOfAddress(address) {
    return this.balances.get(address) || 0;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (!currentBlock.hasValidTransactions()) {
        return false;
      }

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }

    return true;
  }

  getAllBlocks() {
    return this.chain.map(block => block.toJSON());
  }

  getBlockByIndex(index) {
    return this.chain[index] ? this.chain[index].toJSON() : null;
  }

  getPendingTransactions() {
    return this.pendingTransactions.map(tx => tx.toJSON());
  }

  getStats() {
    return {
      totalBlocks: this.chain.length,
      totalUsers: this.users.size,
      totalSupply: this.totalSupply,
      difficulty: this.difficulty,
      pendingTransactions: this.pendingTransactions.length
    };
  }
  registerUser(username, publicKey) {
    if (this.users.has(username)) {
      throw new Error('Username already exists');
    }

    const userInfo = {
      username,
      address: publicKey,
      registeredAt: Date.now()
    };

    this.users.set(username, userInfo);
    
    this.balances.set(publicKey, 1000);
    
    return userInfo;
  }

  getUser(username) {
    return this.users.get(username);
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  deployContract(contractCode, fromAddress) {
    const contractAddress = crypto.createHash('sha512')
      .update(contractCode + fromAddress + Date.now())
      .digest('hex')
      .substring(0, 40);

    this.smartContracts.set(contractAddress, {
      code: contractCode,
      deployer: fromAddress,
      deployedAt: Date.now(),
      storage: {}
    });

    return contractAddress;
  }

  executeContract(contractAddress, method, params, fromAddress) {
    const contract = this.smartContracts.get(contractAddress);
    if (!contract) {
      throw new Error('Contract not found');
    }

    try {
      const contractFunction = new Function('storage', 'params', 'fromAddress', contract.code);
      const result = contractFunction(contract.storage, params, fromAddress);
      return result;
    } catch (error) {
      throw new Error(`Contract execution failed: ${error.message}`);
    }
  }

  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log('Received chain is not longer than current chain.');
      return false;
    }

    if (!this.isValidChain(newChain)) {
      console.log('Received chain is invalid.');
      return false;
    }

    console.log('Replacing blockchain with new chain.');
    this.chain = newChain;
    this.recalculateBalances();
    return true;
  }

  isValidChain(chain) {
    for (let i = 1; i < chain.length; i++) {
      const currentBlock = chain[i];
      const previousBlock = chain[i - 1];

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }

  recalculateBalances() {
    this.balances.clear();
    
    for (const block of this.chain) {
      this.updateBalances(block);
    }
  }
}
