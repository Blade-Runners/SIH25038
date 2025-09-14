import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { CryptoUtils } from "./crypto.js";

export class Block {
  constructor(index, transactions, previousHash, timestamp = Date.now()) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    const data = JSON.stringify({
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions,
      previousHash: this.previousHash,
      nonce: this.nonce,
    });
    return CryptoUtils.sha512(data);
  }
}

export class Transaction {
  constructor(uuid, data, credits = 0, submissionId = null) {
    this.id = submissionId || CryptoUtils.generateUUID();
    this.uuid = uuid;
    this.data = data;
    this.credits = credits;
    this.timestamp = Date.now();
    this.hash = this.calculateHash();
  }

  calculateHash() {
    const data = JSON.stringify({
      id: this.id,
      uuid: this.uuid,
      data: this.data,
      credits: this.credits,
      timestamp: this.timestamp,
    });
    return CryptoUtils.sha512(data);
  }
}

export class ValidationEntry {
  constructor(submissionId, uuid, data, peerId) {
    this.submissionId = submissionId;
    this.uuid = uuid;
    this.data = data;
    this.peerId = peerId;
    this.timestamp = Date.now();
    this.validatorUuids = new Set();
    this.validatorPeers = new Set();
    this.status = "waiting";
  }

  addValidator(uuid, peerId) {
    this.validatorUuids.add(uuid);
    this.validatorPeers.add(peerId);
  }

  shouldValidate(totalUuids, totalPeers, uuidThreshold, peerThreshold) {
    const uuidPercent = this.validatorUuids.size / totalUuids;
    const peerPercent = this.validatorPeers.size / totalPeers;
    return uuidPercent >= uuidThreshold && peerPercent >= peerThreshold;
  }
}

export class BlockchainRegistry {
  constructor(config) {
    this.config = config;
    this.chain = [];
    this.validationPool = new Map(); // submissionId -> ValidationEntry
    this.registeredUuids = new Map(); // uuid -> key
    this.credits = new Map(); // uuid -> balance
    this.creditHistory = new Map(); // uuid -> [transactions]
    this.dataDirectory = config.chain || "data";
    this.saveTimer = null;
    this.p2pNetwork = null;

    if (!existsSync(this.dataDirectory)) {
      mkdirSync(this.dataDirectory, { recursive: true });
    }
  }

  setP2PNetwork(p2pNetwork) {
    this.p2pNetwork = p2pNetwork;
  }

  async initialize() {
    await this.loadFromStorage();

    if (this.chain.length === 0) {
      this.createGenesisBlock();
    }

    this.startPeriodicSave();

    this.startValidationChecker();
  }

  createGenesisBlock() {
    const genesisBlock = new Block(0, [], "0");
    this.chain.push(genesisBlock);
    console.log("Genesis block created");
  }

  async loadFromStorage() {
    try {
      const chainFile = join(this.dataDirectory, "chain.json");
      const registryFile = join(this.dataDirectory, "registry.json");
      const validationFile = join(this.dataDirectory, "validation.json");

      if (existsSync(chainFile)) {
        const chainData = JSON.parse(readFileSync(chainFile, "utf8"));
        this.chain = chainData.chain || [];
        console.log(`Loaded ${this.chain.length} blocks from storage`);
      }

      if (existsSync(registryFile)) {
        const registryData = JSON.parse(readFileSync(registryFile, "utf8"));
        this.registeredUuids = new Map(registryData.registeredUuids || []);
        this.credits = new Map(registryData.credits || []);
        this.creditHistory = new Map(registryData.creditHistory || []);
        console.log(
          `Loaded ${this.registeredUuids.size} registered UUIDs from storage`,
        );
      }

      if (existsSync(validationFile)) {
        const validationData = JSON.parse(readFileSync(validationFile, "utf8"));
        this.validationPool.clear();

        for (const [submissionId, entryData] of validationData.validationPool ||
          []) {
          const entry = new ValidationEntry(
            entryData.submissionId,
            entryData.uuid,
            entryData.data,
            entryData.peerId,
          );
          entry.timestamp = entryData.timestamp;
          entry.status = entryData.status;
          entry.validatorUuids = new Set(entryData.validatorUuids || []);
          entry.validatorPeers = new Set(entryData.validatorPeers || []);
          this.validationPool.set(submissionId, entry);
        }
        console.log(
          `Loaded ${this.validationPool.size} validation entries from storage`,
        );
      }
    } catch (error) {
      console.error("Error loading from storage:", error.message);
    }
  }

  async saveToStorage() {
    try {
      const chainFile = join(this.dataDirectory, "chain.json");
      const registryFile = join(this.dataDirectory, "registry.json");
      const validationFile = join(this.dataDirectory, "validation.json");

      writeFileSync(
        chainFile,
        JSON.stringify(
          {
            chain: this.chain,
            lastSaved: Date.now(),
          },
          null,
          2,
        ),
      );

      writeFileSync(
        registryFile,
        JSON.stringify(
          {
            registeredUuids: Array.from(this.registeredUuids.entries()),
            credits: Array.from(this.credits.entries()),
            creditHistory: Array.from(this.creditHistory.entries()),
            lastSaved: Date.now(),
          },
          null,
          2,
        ),
      );

      const validationPoolData = Array.from(this.validationPool.entries()).map(
        ([submissionId, entry]) => [
          submissionId,
          {
            submissionId: entry.submissionId,
            uuid: entry.uuid,
            data: entry.data,
            peerId: entry.peerId,
            timestamp: entry.timestamp,
            status: entry.status,
            validatorUuids: Array.from(entry.validatorUuids),
            validatorPeers: Array.from(entry.validatorPeers),
          },
        ],
      );

      writeFileSync(
        validationFile,
        JSON.stringify(
          {
            validationPool: validationPoolData,
            lastSaved: Date.now(),
          },
          null,
          2,
        ),
      );

      console.log("Data saved to storage");
    } catch (error) {
      console.error("Error saving to storage:", error.message);
    }
  }

  startPeriodicSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(() => {
      this.saveToStorage();
    }, this.config.saveInterval * 1000);
  }

  startValidationChecker() {
    setInterval(() => {
      this.checkValidationTimeouts();
    }, 30000);
  }

  checkValidationTimeouts() {
    const now = Date.now();
    const timeout = this.config.val_timeout * 1000;

    for (const [submissionId, entry] of this.validationPool.entries()) {
      if (now - entry.timestamp > timeout && entry.status === "waiting") {
        entry.status = "rejected";
        console.log(`Submission ${submissionId} rejected due to timeout`);
        this.validationPool.delete(submissionId);
        if (this.p2pNetwork) {
          this.p2pNetwork.broadcastValidationUpdate(submissionId, "remove");
        }
      }
    }
  }

  registerUuid(uuid) {
    if (this.registeredUuids.has(uuid)) {
      throw new Error("UUID already registered");
    }

    const key = CryptoUtils.generateKey();
    this.registeredUuids.set(uuid, key);
    this.credits.set(uuid, 0);
    this.creditHistory.set(uuid, []);
    if (this.p2pNetwork) {
      this.p2pNetwork.broadcastNewRegistration(uuid, key);
    }
    return key;
  }

  verifyRegistration(uuid, key) {
    return this.registeredUuids.get(uuid) === key;
  }

  submitData(uuid, key, data, peerId = "local") {
    if (!this.verifyRegistration(uuid, key)) {
      throw new Error("Invalid UUID or key");
    }
    const submissionId = CryptoUtils.generateUUID();
    for (const [existingId, existingEntry] of this.validationPool.entries()) {
      if (
        existingEntry.uuid === uuid &&
        JSON.stringify(existingEntry.data) === JSON.stringify(data)
      ) {
        throw new Error("UUID has already submitted this exact data");
      }
    }
    for (const block of this.chain.slice(1)) {
      for (const transaction of block.transactions) {
        if (
          transaction.uuid === uuid &&
          JSON.stringify(transaction.data) === JSON.stringify(data)
        ) {
          throw new Error("UUID has already submitted this exact data");
        }
      }
    }

    if (uuid === this.config.privilegedUuid) {
      for (const [existingId, existingEntry] of this.validationPool.entries()) {
        if (existingEntry.status === "waiting") {
          const similarity = CryptoUtils.calculateSimilarity(
            existingEntry.data,
            data,
          );
          if (similarity >= this.config.sim_thres) {
            existingEntry.status = "validated";
            const transaction = new Transaction(
              existingEntry.uuid,
              existingEntry.data,
              3,
              existingId,
            );
            this.addTransactionToChain(transaction);
            this.awardCredits(existingEntry.uuid, 3);
            this.validationPool.delete(existingId);
            if (this.p2pNetwork) {
              this.p2pNetwork.broadcastValidationUpdate(existingId, "remove");
            }
            console.log(
              `Privileged UUID ${uuid} validated existing submission ${existingId} by ${existingEntry.uuid} - no credits awarded to privileged UUID`,
            );
            return {
              submissionId: existingId,
              status: "validated",
              privilegedValidation: true,
            };
          }
        }
      }
      const transaction = new Transaction(uuid, data, 0, submissionId);
      this.addTransactionToChain(transaction);
      console.log(
        `Privileged UUID ${uuid} submitted pre-validated data with no credits`,
      );
      return { submissionId, status: "validated", preValidated: true };
    }

    for (const [existingId, existingEntry] of this.validationPool.entries()) {
      if (existingEntry.status === "waiting" && existingEntry.uuid !== uuid) {
        const similarity = CryptoUtils.calculateSimilarity(
          existingEntry.data,
          data,
        );
        if (similarity >= this.config.sim_thres) {
          existingEntry.addValidator(uuid, peerId);

          const totalUuids = this.registeredUuids.size;
          const totalPeers = this.p2pNetwork
            ? this.p2pNetwork.getTotalPeerCount()
            : 1;

          console.log(
            `Validation vote for ${existingId} by ${uuid}: ${existingEntry.validatorUuids.size}/${totalUuids} UUIDs (${((existingEntry.validatorUuids.size / totalUuids) * 100).toFixed(1)}%), ${existingEntry.validatorPeers.size}/${totalPeers} peers (${((existingEntry.validatorPeers.size / totalPeers) * 100).toFixed(1)}%)`,
          );

          if (
            existingEntry.shouldValidate(
              totalUuids,
              totalPeers,
              this.config.uuid_val_thres,
              this.config.peer_val_thres,
            )
          ) {
            existingEntry.status = "validated";
            const transaction = new Transaction(
              existingEntry.uuid,
              existingEntry.data,
              3,
              existingId,
            );
            this.addTransactionToChain(transaction);
            this.awardCredits(existingEntry.uuid, 3);

            for (const validatorUuid of existingEntry.validatorUuids) {
              this.awardCredits(validatorUuid, 0.33);
            }

            this.validationPool.delete(existingId);
            if (this.p2pNetwork) {
              this.p2pNetwork.broadcastValidationUpdate(existingId, "remove");
            }

            console.log(
              `Validation completed for ${existingId} by ${existingEntry.uuid} - awarded 3 credits to submitter and 0.33 to each of ${existingEntry.validatorUuids.size} validators`,
            );
          } else {
            if (this.p2pNetwork) {
              this.p2pNetwork.broadcastValidationUpdate(
                existingId,
                "update",
                existingEntry,
              );
            }
          }

          return {
            submissionId: existingId,
            status: existingEntry.status,
            validationVote: true,
          };
        }
      }
    }

    const validationEntry = new ValidationEntry(
      submissionId,
      uuid,
      data,
      peerId,
    );
    this.validationPool.set(submissionId, validationEntry);

    if (this.p2pNetwork) {
      this.p2pNetwork.broadcastValidationUpdate(
        submissionId,
        "add",
        validationEntry,
      );
    }

    return { submissionId, status: "waiting" };
  }

  processValidation(
    submissionId,
    validatorUuid,
    validatorPeerId,
    validatorData,
  ) {
    const originalEntry = this.validationPool.get(submissionId);
    if (!originalEntry || originalEntry.status !== "waiting") {
      return false;
    }

    const similarity = CryptoUtils.calculateSimilarity(
      originalEntry.data,
      validatorData,
    );
    if (similarity < this.config.sim_thres) {
      return false;
    }

    originalEntry.addValidator(validatorUuid, validatorPeerId);

    const totalUuids = this.registeredUuids.size;
    const totalPeers = this.p2pNetwork
      ? this.p2pNetwork.getTotalPeerCount()
      : 1;

    console.log(
      `Validation progress for ${submissionId}: ${originalEntry.validatorUuids.size}/${totalUuids} UUIDs (${((originalEntry.validatorUuids.size / totalUuids) * 100).toFixed(1)}%), ${originalEntry.validatorPeers.size}/${totalPeers} peers (${((originalEntry.validatorPeers.size / totalPeers) * 100).toFixed(1)}%)`,
    );

    if (
      originalEntry.shouldValidate(
        totalUuids,
        totalPeers,
        this.config.uuid_val_thres,
        this.config.peer_val_thres,
      )
    ) {
      originalEntry.status = "validated";
      const transaction = new Transaction(
        originalEntry.uuid,
        originalEntry.data,
        3,
        submissionId,
      );
      this.addTransactionToChain(transaction);
      this.awardCredits(originalEntry.uuid, 3);

      for (const validatorUuid of originalEntry.validatorUuids) {
        this.awardCredits(validatorUuid, 0.33);
      }

      this.validationPool.delete(submissionId);
      if (this.p2pNetwork) {
        this.p2pNetwork.broadcastValidationUpdate(submissionId, "remove");
      }

      console.log(
        `Validation completed for ${submissionId} by ${originalEntry.uuid} - awarded 3 credits to submitter and 0.33 to each of ${originalEntry.validatorUuids.size} validators`,
      );
      return true;
    }

    return false;
  }

  addTransactionToChain(transaction) {
    const previousBlock = this.chain[this.chain.length - 1];
    const newBlock = new Block(
      this.chain.length,
      [transaction],
      previousBlock.hash,
    );
    this.chain.push(newBlock);

    if (this.p2pNetwork) {
      this.p2pNetwork.broadcastNewBlock(newBlock);
    }
  }

  awardCredits(uuid, amount) {
    const currentBalance = this.credits.get(uuid) || 0;
    this.credits.set(uuid, currentBalance + amount);

    const history = this.creditHistory.get(uuid) || [];
    history.push({
      amount,
      timestamp: Date.now(),
      type: "reward",
    });
    this.creditHistory.set(uuid, history);

    if (this.p2pNetwork) {
      this.p2pNetwork.broadcastCreditUpdate(
        uuid,
        currentBalance + amount,
        history,
      );
    }
  }

  getFinalizedData() {
    const data = [];
    for (const block of this.chain.slice(1)) {
      for (const transaction of block.transactions) {
        data.push({
          submissionId: transaction.id,
          uuid: transaction.uuid,
          data: transaction.data,
          credits: transaction.credits,
          timestamp: transaction.timestamp,
          blockIndex: block.index,
        });
      }
    }
    return data;
  }

  getValidationPool() {
    const pool = [];
    for (const [submissionId, entry] of this.validationPool.entries()) {
      pool.push({
        submissionId,
        uuid: entry.uuid,
        data: entry.data,
        status: entry.status,
        timestamp: entry.timestamp,
        validators: entry.validatorUuids.size,
        peers: entry.validatorPeers.size,
      });
    }
    return pool;
  }

  getChainStats() {
    return {
      blockCount: this.chain.length,
      totalTransactions: this.chain.reduce(
        (sum, block) => sum + block.transactions.length,
        0,
      ),
      registeredUuids: this.registeredUuids.size,
      validationPoolSize: this.validationPool.size,
      totalCreditsIssued: Array.from(this.credits.values()).reduce(
        (sum, balance) => sum + balance,
        0,
      ),
    };
  }

  getCredits(uuid) {
    return {
      balance: this.credits.get(uuid) || 0,
      history: this.creditHistory.get(uuid) || [],
    };
  }

  getSubmission(submissionId) {
    const poolEntry = this.validationPool.get(submissionId);
    if (poolEntry) {
      return {
        submissionId,
        uuid: poolEntry.uuid,
        data: poolEntry.data,
        status: poolEntry.status,
        timestamp: poolEntry.timestamp,
        inValidationPool: true,
      };
    }

    for (const block of this.chain.slice(1)) {
      for (const transaction of block.transactions) {
        if (transaction.id === submissionId) {
          return {
            submissionId: transaction.id,
            uuid: transaction.uuid,
            data: transaction.data,
            status: "validated",
            timestamp: transaction.timestamp,
            credits: transaction.credits,
            blockIndex: block.index,
            inValidationPool: false,
          };
        }
      }
    }

    return null;
  }
}
