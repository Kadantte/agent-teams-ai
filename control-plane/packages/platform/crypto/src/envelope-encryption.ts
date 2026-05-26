import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { createSafeError, type SafeError } from "@agent-teams-control-plane/shared";

export type EncryptedEnvelope = Readonly<{
  ciphertext: Uint8Array;
  encryptedDataKey: Uint8Array;
  contentNonce: Uint8Array;
  contentAuthTag: Uint8Array;
  dataKeyNonce: Uint8Array;
  dataKeyAuthTag: Uint8Array;
  ciphertextSha256: string;
  keyRef: string;
  dataKeyAlgorithm: "AES-256-GCM";
  contentEncryptionAlgorithm: "AES-256-GCM";
}>;

export type DecryptedEnvelope = Readonly<{
  plaintext: Uint8Array;
}>;

export interface EnvelopeEncryptionPort {
  encrypt(plaintext: Uint8Array): Promise<EncryptedEnvelope>;
  decrypt(envelope: EncryptedEnvelope): Promise<DecryptedEnvelope>;
}

const algorithm = "aes-256-gcm";
const nonceLength = 12;
const dataKeyLength = 32;

export class NodeCryptoEnvelopeEncryption implements EnvelopeEncryptionPort {
  private readonly masterKey: Buffer;

  public constructor(
    masterKeyBase64: string,
    private readonly keyRef = "env:control-plane-master-key:v1",
  ) {
    this.masterKey = decodeMasterKey(masterKeyBase64);
  }

  public async encrypt(plaintext: Uint8Array): Promise<EncryptedEnvelope> {
    const dataKey = randomBytes(dataKeyLength);
    try {
      const contentNonce = randomBytes(nonceLength);
      const contentCipher = createCipheriv(algorithm, dataKey, contentNonce);
      const ciphertext = Buffer.concat([
        contentCipher.update(plaintext),
        contentCipher.final(),
      ]);
      const contentAuthTag = contentCipher.getAuthTag();

      const dataKeyNonce = randomBytes(nonceLength);
      const dataKeyCipher = createCipheriv(algorithm, this.masterKey, dataKeyNonce);
      const encryptedDataKey = Buffer.concat([
        dataKeyCipher.update(dataKey),
        dataKeyCipher.final(),
      ]);
      const dataKeyAuthTag = dataKeyCipher.getAuthTag();

      return {
        ciphertext,
        ciphertextSha256: sha256Hex(ciphertext),
        contentAuthTag,
        contentEncryptionAlgorithm: "AES-256-GCM",
        contentNonce,
        dataKeyAlgorithm: "AES-256-GCM",
        dataKeyAuthTag,
        dataKeyNonce,
        encryptedDataKey,
        keyRef: this.keyRef,
      };
    } finally {
      dataKey.fill(0);
    }
  }

  public async decrypt(envelope: EncryptedEnvelope): Promise<DecryptedEnvelope> {
    let dataKey: Buffer | undefined;
    try {
      const dataKeyDecipher = createDecipheriv(
        algorithm,
        this.masterKey,
        envelope.dataKeyNonce,
      );
      dataKeyDecipher.setAuthTag(Buffer.from(envelope.dataKeyAuthTag));
      dataKey = Buffer.concat([
        dataKeyDecipher.update(envelope.encryptedDataKey),
        dataKeyDecipher.final(),
      ]);

      const contentDecipher = createDecipheriv(algorithm, dataKey, envelope.contentNonce);
      contentDecipher.setAuthTag(Buffer.from(envelope.contentAuthTag));
      const plaintext = Buffer.concat([
        contentDecipher.update(envelope.ciphertext),
        contentDecipher.final(),
      ]);

      return { plaintext };
    } catch {
      throw createSafeError({
        category: "internal",
        code: "CONTROL_PLANE_DECRYPTION_FAILED",
        message: "Encrypted content could not be decrypted.",
      });
    } finally {
      dataKey?.fill(0);
    }
  }
}

export class DisabledEnvelopeEncryption implements EnvelopeEncryptionPort {
  public async encrypt(): Promise<EncryptedEnvelope> {
    throw disabledCryptoError();
  }

  public async decrypt(): Promise<DecryptedEnvelope> {
    throw disabledCryptoError();
  }
}

function decodeMasterKey(masterKeyBase64: string): Buffer {
  const decoded = Buffer.from(masterKeyBase64.trim(), "base64");
  if (decoded.byteLength !== dataKeyLength) {
    throw new TypeError("Encryption master key must decode to 32 bytes.");
  }
  return decoded;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function disabledCryptoError(): SafeError {
  return createSafeError({
    category: "validation",
    code: "CONTROL_PLANE_CRYPTO_DISABLED",
    message: "Control-plane encryption is disabled.",
  });
}
