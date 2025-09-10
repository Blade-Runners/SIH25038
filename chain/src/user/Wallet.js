import crypto from 'crypto';

export class Wallet {
  constructor() {
    this.keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { 
        type: 'spki', 
        format: 'pem' 
      },
      privateKeyEncoding: { 
        type: 'pkcs8', 
        format: 'pem' 
      }
    });
    
    this.address = this.generateAddress();
  }

  generateAddress() {
    return crypto
      .createHash('sha512')
      .update(this.keyPair.publicKey)
      .digest('hex')
      .substring(0, 40);
  }

  getPublicKey() {
    return this.keyPair.publicKey;
  }

  getPrivateKey() {
    return this.keyPair.privateKey;
  }

  getAddress() {
    return this.address;
  }

  signData(data) {
    const sign = crypto.createSign('SHA512');
    sign.update(data);
    return sign.sign(this.keyPair.privateKey, 'hex');
  }

  static verifySignature(data, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA512');
      verify.update(data);
      return verify.verify(publicKey, signature, 'hex');
    } catch (error) {
      return false;
    }
  }

  toJSON() {
    return {
      address: this.address,
      publicKey: this.keyPair.publicKey
    };
  }
}
