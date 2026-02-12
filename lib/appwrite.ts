import { Account, Client, Databases, Teams } from 'appwrite';
import { getEnv } from './env-config';

const client = new Client();

client
    .setEndpoint(getEnv('NEXT_PUBLIC_APPWRITE_ENDPOINT') || 'https://cloud.appwrite.io/v1')
    .setProject(getEnv('NEXT_PUBLIC_APPWRITE_PROJECT_ID') || '');

export const account = new Account(client);
export const databases = new Databases(client);
export const teams = new Teams(client);
export { client };
