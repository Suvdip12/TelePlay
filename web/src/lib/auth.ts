import { createAuthClient } from '@neondatabase/auth';

let clientInstance: ReturnType<typeof createAuthClient> | null = null;

/**
 * Dynamically gets or initializes the Neon Auth client instance
 */
export function getAuthClient(baseUrl: string) {
    if (!clientInstance) {
        console.log('[AuthClient] Initializing with base URL:', baseUrl);
        clientInstance = createAuthClient(baseUrl);
    }
    return clientInstance;
}
