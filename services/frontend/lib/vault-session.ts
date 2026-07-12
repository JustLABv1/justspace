const DATABASE = 'justspace-vault-session';
const STORE = 'sessions';
const SESSION_KEY = 'active';

export interface PersistedVaultSession {
    userId: string;
    keyId: string;
    expiresAt: number;
    privateKey: CryptoKey;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await openDatabase();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = operation(database.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        database.close();
    }
}

export const vaultSession = {
    async load(userId: string, keyId: string): Promise<PersistedVaultSession | null> {
        const session = await withStore<PersistedVaultSession | undefined>('readonly', (store) => store.get(SESSION_KEY));
        if (!session || session.userId !== userId || session.keyId !== keyId || session.expiresAt <= Date.now()) {
            await this.clear();
            return null;
        }
        return session;
    },
    async save(session: PersistedVaultSession): Promise<void> {
        await withStore<IDBValidKey>('readwrite', (store) => store.put(session, SESSION_KEY));
    },
    async clear(): Promise<void> {
        await withStore<undefined>('readwrite', (store) => store.delete(SESSION_KEY));
    },
};
