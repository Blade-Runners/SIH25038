/**
 * Tests for Blue Carbon MRV blockchain components
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

import CryptoUtils from '../crypto/crypto-utils.js';
import Transaction from '../blockchain/transaction.js';
import Block from '../blockchain/block.js';
import Blockchain from '../blockchain/chain.js';
import CarbonCreditsContract from '../contracts/carbon-credits.js';

describe('Crypto Utils', () => {
  test('should generate SHA512 hash', () => {
    const hash = CryptoUtils.sha512('test data');
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 128); // SHA512 hex length
  });

  test('should generate unique IDs', () => {
    const id1 = CryptoUtils.generateId();
    const id2 = CryptoUtils.generateId();
    assert.strictEqual(typeof id1, 'string');
    assert.notStrictEqual(id1, id2);
  });

  test('should validate GPS coordinates', () => {
    assert.strictEqual(CryptoUtils.validateGPS(12.345, 67.890), true);
    assert.strictEqual(CryptoUtils.validateGPS(91, 67.890), false); // Invalid latitude
    assert.strictEqual(CryptoUtils.validateGPS(12.345, 181), false); // Invalid longitude
  });

  test('should generate and verify signatures', () => {
    const data = 'test data';
    const privateKey = 'test-private-key';
    const publicKey = 'test-private-key'; // Simplified for testing
    
    const signature = CryptoUtils.sign(data, privateKey);
    const isValid = CryptoUtils.verify(data, signature, publicKey);
    
    assert.strictEqual(typeof signature, 'string');
    assert.strictEqual(isValid, true);
  });
});

describe('Transaction', () => {
  test('should create restoration transaction', () => {
    const tx = Transaction.createRestoration({
      organizationId: 'org123',
      location: { latitude: 12.345, longitude: 67.890 },
      area: 1000,
      speciesData: [{ species: 'mangrove', coverage: 0.8 }],
      images: []
    });

    assert.strictEqual(tx.type, 'restoration');
    assert.strictEqual(tx.from, 'org123');
    assert.strictEqual(tx.data.area, 1000);
    assert.strictEqual(tx.isValid(), true);
  });

  test('should create credit mint transaction', () => {
    const tx = Transaction.createCreditMint({
      restorationTxId: 'restoration123',
      credits: 100,
      organizationId: 'org123'
    });

    assert.strictEqual(tx.type, 'credit_mint');
    assert.strictEqual(tx.amount, 100);
    assert.strictEqual(tx.isValid(), true);
  });

  test('should create validation transaction', () => {
    const tx = Transaction.createValidation({
      targetTxId: 'target123',
      validatorId: 'validator1',
      approved: true,
      evidence: 'GPS verified'
    });

    assert.strictEqual(tx.type, 'validation');
    assert.strictEqual(tx.data.approved, true);
    assert.strictEqual(tx.isValid(), true);
  });

  test('should sign and verify transaction', () => {
    const tx = Transaction.createRestoration({
      organizationId: 'org123',
      location: { latitude: 12.345, longitude: 67.890 },
      area: 1000
    });

    const privateKey = 'test-private-key';
    const publicKey = 'test-private-key';

    tx.sign(privateKey);
    assert.strictEqual(typeof tx.signature, 'string');
    assert.strictEqual(tx.verify(publicKey), true);
  });
});

describe('Block', () => {
  test('should create valid block', () => {
    const tx = Transaction.createRestoration({
      organizationId: 'org123',
      location: { latitude: 12.345, longitude: 67.890 },
      area: 1000
    });

    const block = new Block({
      index: 1,
      transactions: [tx],
      previousHash: 'previous-hash',
      authority: 'validator1'
    });

    assert.strictEqual(block.index, 1);
    assert.strictEqual(block.transactions.length, 1);
    assert.strictEqual(typeof block.hash, 'string');
    assert.strictEqual(typeof block.merkleRoot, 'string');
  });

  test('should create genesis block', () => {
    const genesis = Block.createGenesis();
    assert.strictEqual(genesis.index, 0);
    assert.strictEqual(genesis.previousHash, '0');
    assert.strictEqual(genesis.transactions.length, 0);
  });

  test('should sign and verify block', () => {
    const block = new Block({
      index: 1,
      transactions: [],
      previousHash: 'previous-hash',
      authority: 'validator1'
    });

    const privateKey = 'test-private-key';
    const publicKey = 'test-private-key';

    block.sign(privateKey);
    assert.strictEqual(typeof block.signature, 'string');
    assert.strictEqual(block.verifySignature(publicKey), true);
  });
});

describe('Blockchain', () => {
  test('should initialize with genesis block', () => {
    const blockchain = new Blockchain();
    assert.strictEqual(blockchain.chain.length, 1);
    assert.strictEqual(blockchain.chain[0].index, 0);
  });

  test('should add authority', () => {
    const blockchain = new Blockchain();
    blockchain.addAuthority('validator1', 'public-key-1');
    
    const authorities = blockchain.getActiveAuthorities();
    assert.strictEqual(authorities.length, 1);
    assert.strictEqual(authorities[0].id, 'validator1');
  });

  test('should add valid transaction', () => {
    const blockchain = new Blockchain();
    const tx = Transaction.createRestoration({
      organizationId: 'org123',
      location: { latitude: 12.345, longitude: 67.890 },
      area: 1000
    });

    blockchain.addTransaction(tx);
    assert.strictEqual(blockchain.pendingTransactions.length, 1);
  });

  test('should mine pending transactions', async () => {
    const blockchain = new Blockchain();
    blockchain.addAuthority('validator1', 'public-key-1');
    
    const tx = Transaction.createRestoration({
      organizationId: 'org123',
      location: { latitude: 12.345, longitude: 67.890 },
      area: 1000
    });

    blockchain.addTransaction(tx);
    
    const block = blockchain.minePendingTransactions('validator1', 'private-key-1');
    assert.strictEqual(block.transactions.length, 1);
    assert.strictEqual(blockchain.chain.length, 2);
    assert.strictEqual(blockchain.pendingTransactions.length, 0);
  });

  test('should validate blockchain', () => {
    const blockchain = new Blockchain();
    assert.strictEqual(blockchain.isChainValid(), true);
  });
});

describe('Carbon Credits Contract', () => {
  test('should calculate credits from restoration', () => {
    const blockchain = new Blockchain();
    const contract = new CarbonCreditsContract(blockchain);
    
    const tx = Transaction.createRestoration({
      organizationId: 'org123',
      location: { latitude: 12.345, longitude: 67.890 },
      area: 1000,
      speciesData: [{ species: 'mangrove', coverage: 1.0 }],
      images: ['image1.jpg', 'image2.jpg', 'image3.jpg']
    });

    const calculation = contract.calculateCreditsFromRestoration(tx);
    assert.strictEqual(typeof calculation.finalCredits, 'number');
    assert.strictEqual(calculation.finalCredits > 1000, true); // Should be more due to mangrove multiplier
  });

  test('should mint credits', () => {
    const blockchain = new Blockchain();
    const contract = new CarbonCreditsContract(blockchain);
    
    const creditBatchId = contract.mintCredits('restoration123', 'org123', 100);
    assert.strictEqual(typeof creditBatchId, 'string');
    assert.strictEqual(contract.getCreditBalance('org123'), 100);
  });

  test('should transfer credits', () => {
    const blockchain = new Blockchain();
    const contract = new CarbonCreditsContract(blockchain);
    
    // Mint credits first
    contract.mintCredits('restoration123', 'org123', 100);
    
    // Transfer credits
    const transferId = contract.transferCredits('org123', 'org456', 50);
    assert.strictEqual(typeof transferId, 'string');
    assert.strictEqual(contract.getCreditBalance('org123'), 50);
    assert.strictEqual(contract.getCreditBalance('org456'), 50);
  });

  test('should retire credits', () => {
    const blockchain = new Blockchain();
    const contract = new CarbonCreditsContract(blockchain);
    
    // Mint credits first
    contract.mintCredits('restoration123', 'org123', 100);
    
    // Retire credits
    const retirementId = contract.retireCredits('org123', 30, 'Carbon offset purchase');
    assert.strictEqual(typeof retirementId, 'string');
    assert.strictEqual(contract.getCreditBalance('org123'), 70);
  });

  test('should get organization portfolio', () => {
    const blockchain = new Blockchain();
    const contract = new CarbonCreditsContract(blockchain);
    
    contract.mintCredits('restoration123', 'org123', 100);
    contract.retireCredits('org123', 30, 'Test retirement');
    
    const portfolio = contract.getOrganizationPortfolio('org123');
    assert.strictEqual(portfolio.totalActive, 70);
    assert.strictEqual(portfolio.totalRetired, 30);
    assert.strictEqual(portfolio.totalMinted, 100);
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Blue Carbon MRV tests...');
}