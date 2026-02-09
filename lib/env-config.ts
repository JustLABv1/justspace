/**
 * Utility to access environment variables at runtime.
 * On the client, it looks for variables set on window._env_.
 * On the server, it uses process.env.
 */
export const getEnv = (key: string): string => {
    if (typeof window !== 'undefined') {
        // @ts-ignore
        return window._env_?.[key] || '';
    }
    return process.env[key] || '';
};

export const ENV_KEYS = [
    'NEXT_PUBLIC_APPWRITE_ENDPOINT',
    'NEXT_PUBLIC_APPWRITE_PROJECT_ID',
    'NEXT_PUBLIC_APPWRITE_DATABASE_ID',
    'NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID',
    'NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID',
    'NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID',
    'NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID',
    'NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID',
    'NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID',
] as const;

export type EnvKey = typeof ENV_KEYS[number];

export const getRuntimeConfig = () => {
    const config: Record<string, string> = {};
    ENV_KEYS.forEach((key) => {
        config[key] = process.env[key] || '';
    });
    return config;
};
