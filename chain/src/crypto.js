import { createHash, randomBytes } from 'crypto';
import { webcrypto } from 'crypto';

const { subtle } = webcrypto;

export class CryptoUtils {
  static sha512(data) {
    return createHash('sha512').update(data).digest('hex');
  }

  static async generateEd25519KeyPair() {
    return await subtle.generateKey(
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519',
      },
      true,
      ['sign', 'verify']
    );
  }

  static async signEd25519(privateKey, data) {
    const encoder = new TextEncoder();
    const signature = await subtle.sign(
      'Ed25519',
      privateKey,
      encoder.encode(data)
    );
    return Buffer.from(signature).toString('hex');
  }

  static async verifyEd25519(publicKey, signature, data) {
    try {
      const encoder = new TextEncoder();
      return await subtle.verify(
        'Ed25519',
        publicKey,
        Buffer.from(signature, 'hex'),
        encoder.encode(data)
      );
    } catch {
      return false;
    }
  }

  static async generateX448KeyPair() {
    return await subtle.generateKey(
      {
        name: 'X448',
        namedCurve: 'X448',
      },
      true,
      ['deriveKey', 'deriveBits']
    );
  }

  static generateUUID() {
    return randomBytes(16).toString('hex')
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }

  static generateKey() {
    return randomBytes(32).toString('hex');
  }

  static calculateSimilarity(data1, data2) {
    const str1 = JSON.stringify(data1);
    const str2 = JSON.stringify(data2);
    
    if (str1 === str2) return 1.0;
    
    const set1 = new Set(str1.split(''));
    const set2 = new Set(str2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
}
