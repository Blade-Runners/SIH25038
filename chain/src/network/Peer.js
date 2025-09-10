export class Peer {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.id = `${host}:${port}`;
    this.lastSeen = Date.now();
    this.isConnected = false;
  }

  getAddress() {
    return `${this.host}:${this.port}`;
  }

  updateLastSeen() {
    this.lastSeen = Date.now();
  }

  isActive() {
    return Date.now() - this.lastSeen < 300000;
  }

  toJSON() {
    return {
      host: this.host,
      port: this.port,
      id: this.id,
      lastSeen: this.lastSeen,
      isConnected: this.isConnected
    };
  }

  static fromJSON(data) {
    const peer = new Peer(data.host, data.port);
    peer.lastSeen = data.lastSeen;
    peer.isConnected = data.isConnected;
    return peer;
  }
}
