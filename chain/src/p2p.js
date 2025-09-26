import { WebSocketServer, WebSocket } from "ws";
import { networkInterfaces } from "os";
import { createHash } from "crypto";
import { ValidationEntry } from "./blockchain.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export class P2PNetwork {
  constructor(config, blockchain) {
    this.config = config;
    this.blockchain = blockchain;
    this.server = null;
    this.peers = new Map();
    this.peerId = this.loadOrGeneratePeerId();
    this.discoveryInterval = null;
    this.cleanupInterval = null;
  }

  loadOrGeneratePeerId() {
    const peerFilePath = join(process.cwd(), "peer.json");

    try {
      if (existsSync(peerFilePath)) {
        const peerData = JSON.parse(readFileSync(peerFilePath, "utf8"));
        if (peerData.peerId && typeof peerData.peerId === "string") {
          console.log(`Loaded existing peer ID: ${peerData.peerId}`);
          return peerData.peerId;
        }
      }
    } catch (error) {
      console.warn(
        "Error loading peer.json, will generate new peer ID:",
        error.message,
      );
    }

    const newPeerId = this.generatePeerId();
    this.savePeerId(newPeerId);
    console.log(`Generated new peer ID: ${newPeerId}`);
    return newPeerId;
  }

  savePeerId(peerId) {
    const peerFilePath = join(process.cwd(), "peer.json");
    const peerData = {
      peerId: peerId,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    try {
      writeFileSync(peerFilePath, JSON.stringify(peerData, null, 2));
      console.log(`Peer ID saved to ${peerFilePath}`);
    } catch (error) {
      console.error("Error saving peer.json:", error.message);
    }
  }

  updateLastUsed() {
    const peerFilePath = join(process.cwd(), "peer.json");

    try {
      if (existsSync(peerFilePath)) {
        const peerData = JSON.parse(readFileSync(peerFilePath, "utf8"));
        peerData.lastUsed = new Date().toISOString();
        writeFileSync(peerFilePath, JSON.stringify(peerData, null, 2));
      }
    } catch (error) {
      console.warn(
        "Error updating peer.json last used timestamp:",
        error.message,
      );
    }
  }

  generatePeerIdFromAddress(address, port) {
    return createHash("md5")
      .update(`${address}:${port}`)
      .digest("hex")
      .substring(0, 12);
  }

  generatePeerId() {
    return Math.random().toString(36).substring(2, 15);
  }

  async start() {
    this.updateLastUsed();

    this.server = new WebSocketServer({
      port: this.config.p2p,
      perMessageDeflate: false,
    });

    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`P2P Error: Port ${this.config.p2p} is already in use. Please check if another instance of the application is running.`);
        process.exit(1);
      } else {
        console.error('P2P server error:', error);
      }
    });

    this.server.on("connection", (ws, req) => {
      this.handleNewConnection(ws, req);
    });

    console.log(
      `P2P server started on port ${this.config.p2p} with peer ID: ${this.peerId}`,
    );

    this.startPeerDiscovery();

    this.startPeerCleanup();
  }

  handleNewConnection(ws, req) {
    const remoteAddress = this.normalizeIPv4(req.socket.remoteAddress);
    const remotePeerId = req.headers["x-peer-id"];

    const peerId =
      remotePeerId ||
      this.generatePeerIdFromAddress(remoteAddress, this.config.p2p);

    if (this.peers.has(peerId)) {
      console.log(`Duplicate connection from peer ${peerId}, closing existing`);
      this.peers.get(peerId).ws.terminate();
    }

    console.log(`New peer connected: ${peerId} from ${remoteAddress}`);

    this.peers.set(peerId, {
      ws,
      lastSeen: Date.now(),
      info: {
        remoteAddress,
        connectedAt: Date.now(),
      },
    });

    ws.on("message", (data) => {
      this.handleMessage(peerId, data);
    });

    ws.on("close", () => {
      console.log(`Peer disconnected: ${peerId}`);
      this.peers.delete(peerId);
    });

    ws.on("error", (error) => {
      console.error(`Peer error ${peerId}:`, error.message);
      this.peers.delete(peerId);
    });

    this.sendFullStateSync(peerId);
  }

  handleMessage(peerId, data) {
    try {
      const message = JSON.parse(data.toString());
      const peer = this.peers.get(peerId);

      if (peer) {
        peer.lastSeen = Date.now();
      }

      switch (message.type) {
        case "ping":
          this.sendToPeer(peerId, { type: "pong", timestamp: Date.now() });
          break;

        case "pong":
          break;

        case "full_state_sync":
          this.handleFullStateSync(peerId, message.data);
          break;

        case "state_sync_request":
          this.handleStateSyncRequest(peerId);
          break;

        case "new_block":
          this.handleNewBlock(peerId, message.data);
          break;

        case "new_submission":
          this.handleNewSubmission(peerId, message.data);
          break;

        case "validation_vote":
          this.handleValidationVote(peerId, message.data);
          break;

        case "new_registration":
          this.handleNewRegistration(peerId, message.data);
          break;

        case "credit_update":
          this.handleCreditUpdate(peerId, message.data);
          break;

        case "validation_update":
          this.handleValidationUpdate(peerId, message.data);
          break;

        case "peer_discovery":
          this.handlePeerDiscovery(peerId, message.data);
          break;

        default:
          console.log(`Unknown message type from ${peerId}: ${message.type}`);
      }
    } catch (error) {
      console.error(`Error handling message from ${peerId}:`, error.message);
    }
  }

  sendToPeer(peerId, message) {
    const peer = this.peers.get(peerId);
    if (peer && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  broadcast(message, excludePeerId = null) {
    for (const [peerId, peer] of this.peers.entries()) {
      if (peerId !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(JSON.stringify(message));
      }
    }
  }

  handleChainSync(peerId, data) {
    const ourChain = this.blockchain.chain;
    const peerChain = data.chain;

    if (peerChain.length > ourChain.length) {
      console.log(
        `Peer ${peerId} has longer chain (${peerChain.length} vs ${ourChain.length})`,
      );
    }
  }

  handleFullStateSync(peerId, data) {
    const {
      chain,
      registeredUuids,
      credits,
      creditHistory,
      validationPool,
      timestamp,
    } = data;

    let stateChanged = false;

    if (
      chain.length > this.blockchain.chain.length ||
      (chain.length === this.blockchain.chain.length &&
        timestamp > (this.lastSyncTimestamp || 0))
    ) {
      console.log(
        `Syncing chain from peer ${peerId}: ${this.blockchain.chain.length} -> ${chain.length} blocks`,
      );
      this.blockchain.chain = chain;
      stateChanged = true;
    }

    if (registeredUuids) {
      const oldSize = this.blockchain.registeredUuids.size;
      this.blockchain.registeredUuids = new Map(registeredUuids);
      if (this.blockchain.registeredUuids.size > oldSize) {
        console.log(
          `Synced registrations: ${oldSize} -> ${this.blockchain.registeredUuids.size} UUIDs`,
        );
        stateChanged = true;
      }
    }

    if (credits) {
      this.blockchain.credits = new Map(credits);
      stateChanged = true;
    }

    if (creditHistory) {
      this.blockchain.creditHistory = new Map(creditHistory);
    }

    if (validationPool) {
      const oldSize = this.blockchain.validationPool.size;
      this.blockchain.validationPool.clear();
      for (const [submissionId, entryData] of validationPool) {
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

        this.blockchain.validationPool.set(submissionId, entry);
      }
      if (this.blockchain.validationPool.size !== oldSize) {
        console.log(
          `Synced validation pool: ${oldSize} -> ${this.blockchain.validationPool.size} entries`,
        );
        stateChanged = true;
      }
    }

    if (stateChanged) {
      this.lastSyncTimestamp = Date.now();
      console.log(
        `Full state synced from peer ${peerId}: ${chain.length} blocks, ${registeredUuids?.length || 0} UUIDs, ${validationPool?.length || 0} validations`,
      );
    }
  }

  handleStateSyncRequest(peerId) {
    this.sendFullStateSync(peerId);
  }

  sendFullStateSync(peerId) {
    const stateData = {
      chain: this.blockchain.chain,
      registeredUuids: Array.from(this.blockchain.registeredUuids.entries()),
      credits: Array.from(this.blockchain.credits.entries()),
      creditHistory: Array.from(this.blockchain.creditHistory.entries()),
      validationPool: Array.from(this.blockchain.validationPool.entries()).map(
        ([id, entry]) => [
          id,
          {
            ...entry,
            validatorUuids: Array.from(entry.validatorUuids),
            validatorPeers: Array.from(entry.validatorPeers),
          },
        ],
      ),
      timestamp: Date.now(),
      peerId: this.peerId,
    };

    this.sendToPeer(peerId, {
      type: "full_state_sync",
      data: stateData,
    });
  }

  handleNewRegistration(peerId, data) {
    const { uuid, key } = data;

    if (!this.blockchain.registeredUuids.has(uuid)) {
      this.blockchain.registeredUuids.set(uuid, key);
      this.blockchain.credits.set(uuid, 0);
      this.blockchain.creditHistory.set(uuid, []);
      console.log(`Synced new registration: ${uuid}`);
    }
  }

  handleCreditUpdate(peerId, data) {
    const { uuid, credits, creditHistory } = data;

    this.blockchain.credits.set(uuid, credits);
    this.blockchain.creditHistory.set(uuid, creditHistory);
    console.log(`Synced credit update for ${uuid}: ${credits}`);
  }

  handleValidationUpdate(peerId, data) {
    const { submissionId, action, entry } = data;

    if (action === "add") {
      if (!this.blockchain.validationPool.has(submissionId)) {
        const validationEntry = new ValidationEntry(
          entry.submissionId,
          entry.uuid,
          entry.data,
          entry.peerId,
        );
        validationEntry.timestamp = entry.timestamp;
        validationEntry.status = entry.status;
        validationEntry.validatorUuids = new Set(entry.validatorUuids || []);
        validationEntry.validatorPeers = new Set(entry.validatorPeers || []);

        this.blockchain.validationPool.set(submissionId, validationEntry);
        console.log(`Synced new validation entry: ${submissionId}`);
      }
    } else if (action === "remove") {
      this.blockchain.validationPool.delete(submissionId);
      console.log(`Synced validation removal: ${submissionId}`);
    } else if (action === "update") {
      const existingEntry = this.blockchain.validationPool.get(submissionId);
      if (existingEntry) {
        if (typeof existingEntry.addValidator !== "function") {
          const validationEntry = new ValidationEntry(
            existingEntry.submissionId,
            existingEntry.uuid,
            existingEntry.data,
            existingEntry.peerId,
          );
          validationEntry.timestamp = existingEntry.timestamp;
          validationEntry.status = entry.status;
          validationEntry.validatorUuids = new Set(entry.validatorUuids || []);
          validationEntry.validatorPeers = new Set(entry.validatorPeers || []);
          this.blockchain.validationPool.set(submissionId, validationEntry);
        } else {
          existingEntry.status = entry.status;
          existingEntry.validatorUuids = new Set(entry.validatorUuids || []);
          existingEntry.validatorPeers = new Set(entry.validatorPeers || []);
        }
        console.log(
          `Synced validation update: ${submissionId} - ${entry.status}`,
        );
      }
    }
  }

  sendChainSync(peerId) {
    this.sendToPeer(peerId, {
      type: "chain_sync",
      data: {
        chain: this.blockchain.chain,
        peerId: this.peerId,
      },
    });
  }

  handleNewBlock(peerId, data) {
    const { block } = data;

    if (
      block.index === this.blockchain.chain.length &&
      block.previousHash ===
        this.blockchain.chain[this.blockchain.chain.length - 1].hash
    ) {
      const newBlock = Object.assign(
        new (Object.getPrototypeOf(this.blockchain.chain[0]).constructor)(),
        block,
      );
      this.blockchain.chain.push(newBlock);

      console.log(
        `Synced new block ${block.index} from peer ${peerId} with ${block.transactions.length} transactions`,
      );

      for (const transaction of block.transactions) {
        console.log(
          `Block contains transaction: ${transaction.uuid} -> ${transaction.credits} credits`,
        );
      }
    }
  }

  handleNewSubmission(peerId, data) {
    const { submissionId, uuid, submissionData } = data;

    const validationEntry = this.blockchain.validationPool.get(submissionId);
    if (validationEntry && validationEntry.status === "waiting") {
      this.blockchain.processValidation(
        submissionId,
        uuid,
        peerId,
        submissionData,
      );
    }
  }

  handleValidationVote(peerId, data) {
    const { submissionId, validatorUuid, validatorData } = data;
    this.blockchain.processValidation(
      submissionId,
      validatorUuid,
      peerId,
      validatorData,
    );
  }

  handlePeerDiscovery(peerId, data) {
    const { peers } = data;

    for (const peerInfo of peers) {
      if (!this.peers.has(peerInfo.peerId) && peerInfo.peerId !== this.peerId) {
        this.connectToPeer(peerInfo.address, peerInfo.port, peerInfo.peerId);
      }
    }
  }

  async connectToPeer(address, port, peerId = null) {
    if (this.isConnectedToAddress(address)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(`ws://${address}:${port}`, {
          headers: {
            "x-peer-id": this.peerId,
          },
        });

        const timeout = setTimeout(() => {
          ws.terminate();
          reject(new Error("Connection timeout"));
        }, 5000);

        ws.on("open", () => {
          clearTimeout(timeout);
          const actualPeerId =
            peerId || this.generatePeerIdFromAddress(address, port);
          console.log(
            `Connected to peer: ${actualPeerId} at ${address}:${port}`,
          );

          this.peers.set(actualPeerId, {
            ws,
            lastSeen: Date.now(),
            info: {
              remoteAddress: this.normalizeIPv4(address),
              connectedAt: Date.now(),
            },
          });

          this.sendToPeer(actualPeerId, {
            type: "state_sync_request",
            peerId: this.peerId,
          });
          resolve();
        });

        ws.on("message", (data) => {
          const actualPeerId =
            peerId || this.generatePeerIdFromAddress(address, port);
          this.handleMessage(actualPeerId, data);
        });

        ws.on("close", () => {
          if (peerId) {
            console.log(`Connection to peer ${peerId} closed`);
            this.peers.delete(peerId);
          }
        });

        ws.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  startPeerDiscovery() {
    this.discoverPeers();
    this.discoveryInterval = setInterval(() => {
      this.discoverPeers();
    }, 30000);
  }

  async discoverPeers() {
    const startTime = Date.now();
    let foundPeers = 0;
    const initialPeerCount = this.peers.size;

    try {
      const subnet = this.getSubnetAddresses();
      const commonPorts = [this.config.p2p, 3001];
      const connectionPromises = [];

      for (const address of subnet) {
        for (const port of commonPorts) {
          if (
            !(port === this.config.p2p && this.isOwnAddress(address)) &&
            !this.isConnectedToAddress(address)
          ) {
            connectionPromises.push(
              this.connectToPeer(address, port).catch(() => {}),
            );
          }
        }
      }

      await Promise.allSettled(connectionPromises);

      foundPeers = this.peers.size - initialPeerCount;

      const scanTime = Date.now() - startTime;
      console.log(
        `Found ${foundPeers} peers, scan completed in ${scanTime} ms`,
      );
    } catch (error) {
      const scanTime = Date.now() - startTime;
      console.log(
        `Found 0 peers, scan completed in ${scanTime} ms (error: ${error.message})`,
      );
    }
  }

  getSubnetAddresses() {
    const addresses = [];
    const interfaces = networkInterfaces();

    addresses.push("127.0.0.1");

    for (const interfaceName of Object.keys(interfaces)) {
      const interfaceInfo = interfaces[interfaceName];

      for (const info of interfaceInfo) {
        if (info.family === "IPv4" && !info.internal) {
          const parts = info.address.split(".");
          const baseNetwork = parts.slice(0, 3).join(".");

          for (let i = 1; i < 255; i++) {
            const address = `${baseNetwork}.${i}`;
            if (address !== info.address) {
              addresses.push(address);
            }
          }
        }
      }
    }

    return addresses.slice(0, 50);
  }

  normalizeIPv4(address) {
    if (address && address.startsWith("::ffff:")) {
      return address.substring(7);
    }
    return address;
  }

  isConnectedToAddress(address) {
    const normalizedAddress = this.normalizeIPv4(address);
    for (const peer of this.peers.values()) {
      if (this.normalizeIPv4(peer.info.remoteAddress) === normalizedAddress) {
        return true;
      }
    }
    return false;
  }

  isOwnAddress(address) {
    const normalizedAddress = this.normalizeIPv4(address);

    if (
      normalizedAddress === "127.0.0.1" ||
      normalizedAddress === "localhost"
    ) {
      return true;
    }

    const interfaces = networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
      const interfaceInfo = interfaces[interfaceName];
      for (const info of interfaceInfo) {
        if (
          info.family === "IPv4" &&
          this.normalizeIPv4(info.address) === normalizedAddress
        ) {
          return true;
        }
      }
    }

    return false;
  }

  startPeerCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePeers();
    }, 60000);
  }

  cleanupInactivePeers() {
    const now = Date.now();
    const inactiveTimeout = this.config.inactiveTime * 60 * 1000;

    for (const [peerId, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > inactiveTimeout) {
        console.log(`Removing inactive peer: ${peerId}`);
        peer.ws.terminate();
        this.peers.delete(peerId);
      }
    }
  }

  broadcastSubmission(submissionId, uuid, data) {
    this.broadcast({
      type: "new_submission",
      data: {
        submissionId,
        uuid,
        submissionData: data,
        timestamp: Date.now(),
        peerId: this.peerId,
      },
    });
  }

  broadcastValidationVote(submissionId, validatorUuid, validatorData) {
    this.broadcast({
      type: "validation_vote",
      data: {
        submissionId,
        validatorUuid,
        validatorData,
        timestamp: Date.now(),
        peerId: this.peerId,
      },
    });
  }

  broadcastFullState() {
    const stateData = {
      chain: this.blockchain.chain,
      registeredUuids: Array.from(this.blockchain.registeredUuids.entries()),
      credits: Array.from(this.blockchain.credits.entries()),
      creditHistory: Array.from(this.blockchain.creditHistory.entries()),
      validationPool: Array.from(this.blockchain.validationPool.entries()).map(
        ([id, entry]) => [
          id,
          {
            ...entry,
            validatorUuids: Array.from(entry.validatorUuids),
            validatorPeers: Array.from(entry.validatorPeers),
          },
        ],
      ),
      timestamp: Date.now(),
      peerId: this.peerId,
    };

    this.broadcast({
      type: "full_state_sync",
      data: stateData,
    });
  }

  broadcastNewBlock(block) {
    this.broadcast({
      type: "new_block",
      data: {
        block,
        timestamp: Date.now(),
        peerId: this.peerId,
      },
    });
  }

  broadcastNewRegistration(uuid, key) {
    this.broadcast({
      type: "new_registration",
      data: {
        uuid,
        key,
        timestamp: Date.now(),
        peerId: this.peerId,
      },
    });
  }

  broadcastCreditUpdate(uuid, credits, creditHistory) {
    this.broadcast({
      type: "credit_update",
      data: {
        uuid,
        credits,
        creditHistory,
        timestamp: Date.now(),
        peerId: this.peerId,
      },
    });
  }

  broadcastValidationUpdate(submissionId, action, entry = null) {
    const data = {
      submissionId,
      action,
      timestamp: Date.now(),
      peerId: this.peerId,
    };

    if (entry) {
      data.entry = {
        ...entry,
        validatorUuids: Array.from(entry.validatorUuids || []),
        validatorPeers: Array.from(entry.validatorPeers || []),
      };
    }

    this.broadcast({
      type: "validation_update",
      data,
    });
  }

  getConnectedPeers() {
    const peers = [];
    for (const [peerId, peer] of this.peers.entries()) {
      peers.push({
        peerId,
        address: peer.info.remoteAddress,
        connectedAt: peer.info.connectedAt,
        lastSeen: peer.lastSeen,
        status:
          peer.ws.readyState === WebSocket.OPEN ? "connected" : "disconnected",
      });
    }
    return peers;
  }

  getTotalPeerCount() {
    return this.peers.size + 1;
  }

  getConnectedPeerCount() {
    let connected = 0;
    for (const peer of this.peers.values()) {
      if (peer.ws.readyState === WebSocket.OPEN) {
        connected++;
      }
    }
    return connected;
  }

  stop() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const peer of this.peers.values()) {
      peer.ws.terminate();
    }
    this.peers.clear();

    if (this.server) {
      this.server.close();
    }
  }
}
