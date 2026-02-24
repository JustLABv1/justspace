/**
 * Utility to access environment variables at runtime.
 * On the client, it looks for variables set on window._env_.
 * On the server, it uses process.env.
 */
export const getEnv = (key: string): string => {
    if (typeof window !== 'undefined') {
        const val = (window as any)._env_?.[key];
        if (!val) {
            console.warn(`Environment variable ${key} is missing in window._env_`);
        }
        return val || '';
    }
    return process.env[key] || '';
};

export const ENV_KEYS = [
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_WS_URL',
] as const;

export type EnvKey = typeof ENV_KEYS[number];

export const getRuntimeConfig = () => {
    const config: Record<string, string> = {};
    ENV_KEYS.forEach((key) => {
        config[key] = process.env[key] || '';
    });
    return config;
};
