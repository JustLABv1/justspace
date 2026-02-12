import { Account, Client, Databases } from 'appwrite';
import { getEnv } from './env-config';

const client = new Client();

client
    .setEndpoint(getEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT') || 'https://cloud.appwrite.io/v1')
    .setProject(getEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID') || '');

export const account = new Account(client);
export const databases = new Databases(client);
export { client };
