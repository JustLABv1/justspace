'use server';

import { adminDb } from '@/lib/appwrite-admin';

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const PROJECTS_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID!;
const GUIDES_ID = process.env.NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID!;

export async function updateResourcePermissions(
    resourceId: string, 
    resourceType: 'Project' | 'Wiki', 
    userId: string, 
    action: 'add' | 'remove'
) {
    if (!DB_ID || !resourceId || !userId) {
        throw new Error('Missing configuration or identifiers');
    }

    const collectionId = resourceType === 'Project' ? PROJECTS_ID : GUIDES_ID;

    try {
        const resource = await adminDb.getDocument(DB_ID, collectionId, resourceId);
        
        // Use string format directly to avoid SDK version/instanceof conflicts in Next.js
        const readPerm = `read("user:${userId}")`;
        const updatePerm = `update("user:${userId}")`;
        
        let newPermissions = [...(resource.$permissions || [])];

        if (action === 'add') {
            if (!newPermissions.includes(readPerm)) newPermissions.push(readPerm);
            if (!newPermissions.includes(updatePerm)) newPermissions.push(updatePerm);
        } else {
            newPermissions = newPermissions.filter(p => !p.includes(`user:${userId}`));
        }

        await adminDb.updateDocument(DB_ID, collectionId, resourceId, {}, newPermissions);
        return { success: true };
    } catch (error) {
        console.error('Permission update failed:', error);
        throw error;
    }
}
