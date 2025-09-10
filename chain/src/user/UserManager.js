import crypto from 'crypto';
import { Wallet } from './Wallet.js';

export class UserManager {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.loginAttempts = new Map();
  }

  register(username, password) {
    if (this.users.has(username)) {
      throw new Error('Username already exists');
    }

    if (username.length < 3 || password.length < 6) {
      throw new Error('Username must be at least 3 characters and password at least 6 characters');
    }

    const wallet = new Wallet();
    
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedPassword = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');

    const userData = {
      username,
      passwordHash: hashedPassword,
      salt,
      wallet: wallet,
      address: wallet.getAddress(),
      publicKey: wallet.getPublicKey(),
      registeredAt: Date.now(),
      lastLogin: null
    };

    this.users.set(username, userData);

    return {
      username,
      address: userData.address,
      publicKey: userData.publicKey,
      registeredAt: userData.registeredAt
    };
  }

  login(username, password) {
    const user = this.users.get(username);
    if (!user) {
      throw new Error('Invalid username or password');
    }

    const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
    if (attempts.count >= 5 && Date.now() - attempts.lastAttempt < 300000) { // 5 minutes lockout
      throw new Error('Too many login attempts. Please try again later.');
    }

    const hashedPassword = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
    
    if (hashedPassword !== user.passwordHash) {
      attempts.count++;
      attempts.lastAttempt = Date.now();
      this.loginAttempts.set(username, attempts);
      throw new Error('Invalid username or password');
    }

    this.loginAttempts.delete(username);

    const sessionId = crypto.randomBytes(32).toString('hex');
    this.sessions.set(sessionId, username);

    user.lastLogin = Date.now();

    return {
      sessionId,
      user: {
        username: user.username,
        address: user.address,
        publicKey: user.publicKey,
        registeredAt: user.registeredAt,
        lastLogin: user.lastLogin
      }
    };
  }

  logout(sessionId) {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  verifySession(sessionId) {
    const username = this.sessions.get(sessionId);
    if (!username) {
      return null;
    }

    const user = this.users.get(username);
    return user ? {
      username: user.username,
      address: user.address,
      publicKey: user.publicKey
    } : null;
  }

  getUser(username) {
    const user = this.users.get(username);
    if (!user) {
      return null;
    }

    return {
      username: user.username,
      address: user.address,
      publicKey: user.publicKey,
      registeredAt: user.registeredAt,
      lastLogin: user.lastLogin
    };
  }

  getUserByAddress(address) {
    for (const [username, user] of this.users) {
      if (user.address === address) {
        return {
          username: user.username,
          address: user.address,
          publicKey: user.publicKey,
          registeredAt: user.registeredAt,
          lastLogin: user.lastLogin
        };
      }
    }
    return null;
  }

  getAllUsers() {
    return Array.from(this.users.values()).map(user => ({
      username: user.username,
      address: user.address,
      registeredAt: user.registeredAt,
      lastLogin: user.lastLogin
    }));
  }

  getUserWallet(username) {
    const user = this.users.get(username);
    return user ? user.wallet : null;
  }

  getTotalUsers() {
    return this.users.size;
  }
}
