/**
 * Encryption utility using Web Crypto API for End-to-End Encryption (E2EE).
 */

const ALGORITHM_AES = 'AES-GCM';
const ALGORITHM_RSA = 'RSA-OAEP';

export interface EncryptedData {
    ciphertext: string;
    iv: string;
}

export interface EncryptedBytes {
    ciphertext: Uint8Array;
    iv: string;
}

function bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
    const raw = atob(value);
    const out = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
        out[index] = raw.charCodeAt(index);
    }
    return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const out = new Uint8Array(bytes.byteLength);
    out.set(bytes);
    return out.buffer;
}

export interface UserKeyPair {
    publicKey: string;
    encryptedPrivateKey: string;
    salt: string;
    iv: string;
}

/**
 * Derives a cryptographic key from a password using PBKDF2.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: toArrayBuffer(salt),
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        { name: ALGORITHM_AES, length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Generates an RSA-OAEP key pair for a user.
 * The private key is encrypted with the derived vault key.
 */
export async function generateUserKeyPair(vaultPassword: string): Promise<UserKeyPair> {
    const publicExponent = new Uint8Array(3);
    publicExponent.set([1, 0, 1]);
    const keyPair = await crypto.subtle.generateKey(
        {
            name: ALGORITHM_RSA,
            modulusLength: 2048,
            publicExponent,
            hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
    );

    // Export public key
    const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicKeyStr = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));

    // Export and encrypt private key
    const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const vaultKey = await deriveKey(vaultPassword, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedPrivateKeyBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM_AES, iv },
        vaultKey,
        privateKeyBuffer
    );

    const encryptedPrivateKeyStr = btoa(String.fromCharCode(...new Uint8Array(encryptedPrivateKeyBuffer)));

    return {
        publicKey: publicKeyStr,
        encryptedPrivateKey: encryptedPrivateKeyStr,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv)
    };
}

/**
 * Decrypts a user's private key using their vault password.
 */
export async function decryptPrivateKey(
    encryptedPrivateKeyStr: string,
    vaultPassword: string,
    saltStr: string,
    ivStr: string
): Promise<CryptoKey> {
    const encryptedPrivateKey = base64ToBytes(encryptedPrivateKeyStr);
    const salt = base64ToBytes(saltStr);
    const iv = base64ToBytes(ivStr);

    const vaultKey = await deriveKey(vaultPassword, salt);

    const privateKeyBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM_AES, iv: toArrayBuffer(iv) },
        vaultKey,
        toArrayBuffer(encryptedPrivateKey)
    );

    return await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        { name: ALGORITHM_RSA, hash: 'SHA-256' },
        true,
        ['decrypt']
    );
}

/**
 * Generates a random AES-GCM key for a document.
 */
export async function generateDocumentKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: ALGORITHM_AES, length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts data using AES-GCM.
 */
export async function encryptData(data: string, key: CryptoKey): Promise<EncryptedData> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM_AES, iv: toArrayBuffer(iv) },
        key,
        encoder.encode(data)
    );

    return {
        ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
        iv: bytesToBase64(iv)
    };
}

/**
 * Decrypts data using AES-GCM.
 */
export async function decryptData(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
    const decoder = new TextDecoder();
    const ciphertext = base64ToBytes(encryptedData.ciphertext);
    const iv = base64ToBytes(encryptedData.iv);

    const plaintextBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM_AES, iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext)
    );

    return decoder.decode(plaintextBuffer);
}

export async function encryptBytes(data: ArrayBuffer, key: CryptoKey): Promise<EncryptedBytes> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM_AES, iv: toArrayBuffer(iv) },
        key,
        data
    );

    return {
        ciphertext: new Uint8Array(ciphertextBuffer),
        iv: bytesToBase64(iv)
    };
}

export async function decryptBytes(data: { ciphertext: ArrayBuffer; iv: string }, key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
        { name: ALGORITHM_AES, iv: toArrayBuffer(base64ToBytes(data.iv)) },
        key,
        data.ciphertext
    );
}

/**
 * Encrypts a document key using a user's public key (RSA-OAEP).
 */
export async function encryptDocumentKey(docKey: CryptoKey, publicKeyStr: string): Promise<string> {
    const publicKeyBuffer = base64ToBytes(publicKeyStr);
    const publicKey = await crypto.subtle.importKey(
        'spki',
        toArrayBuffer(publicKeyBuffer),
        { name: ALGORITHM_RSA, hash: 'SHA-256' },
        true,
        ['encrypt']
    );

    const exportedDocKey = await crypto.subtle.exportKey('raw', docKey);
    const encryptedKeyBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM_RSA },
        publicKey,
        exportedDocKey
    );

    return btoa(String.fromCharCode(...new Uint8Array(encryptedKeyBuffer)));
}

/**
 * Decrypts a document key using a user's private key (RSA-OAEP).
 */
export async function decryptDocumentKey(encryptedKeyStr: string, privateKey: CryptoKey): Promise<CryptoKey> {
    const encryptedKey = base64ToBytes(encryptedKeyStr);

    const docKeyBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM_RSA },
        privateKey,
        toArrayBuffer(encryptedKey)
    );

    return await crypto.subtle.importKey(
        'raw',
        docKeyBuffer,
        { name: ALGORITHM_AES, length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}
