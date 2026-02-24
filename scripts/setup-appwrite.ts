import dotenv from 'dotenv';
import { Client, Databases, IndexType, Permission, Role } from 'node-appwrite';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface AppwriteError extends Error {
  code: number;
}

interface Attribute {
  key: string;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'enum';
  size?: number;
  required: boolean;
  elements?: string[];
  array?: boolean;
  default?: string | number | boolean | string[] | null;
}

interface Index {
  key: string;
  type: IndexType;
  attributes: string[];
}

interface CollectionDefinition {
  id: string;
  name: string;
  attributes: Attribute[];
  indexes?: Index[];
}

const env = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  apiKey: process.env.APPWRITE_API_KEY,
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID,
  projectsId: process.env.NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID || 'projects',
  tasksId: process.env.NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID || 'tasks',
  guidesId: process.env.NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID || 'wiki_guides',
  installationsId: process.env.NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID || 'installations',
  activityId: process.env.NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID || 'activity',
  snippetsId: process.env.NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID || 'snippets',
  userKeysId: process.env.NEXT_PUBLIC_APPWRITE_USER_KEYS_COLLECTION_ID || 'user_keys',
  accessControlId: process.env.NEXT_PUBLIC_APPWRITE_ACCESS_CONTROL_COLLECTION_ID || 'access_control',
  versionsId: process.env.NEXT_PUBLIC_APPWRITE_VERSIONS_COLLECTION_ID || 'resource_versions',
};

if (!env.endpoint || !env.projectId || !env.apiKey || !env.databaseId) {
  console.error('Missing required environment variables. Please ensure .env.local has:');
  console.error('NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID, APPWRITE_API_KEY, NEXT_PUBLIC_APPWRITE_DATABASE_ID');
  process.exit(1);
}

// Non-null assertions after the check above
const config = {
  endpoint: env.endpoint!,
  projectId: env.projectId!,
  apiKey: env.apiKey!,
  databaseId: env.databaseId!,
  projectsId: env.projectsId as string,
  tasksId: env.tasksId as string,
  guidesId: env.guidesId as string,
  installationsId: env.installationsId as string,
  activityId: env.activityId as string,
  snippetsId: env.snippetsId as string,
  userKeysId: env.userKeysId as string,
  accessControlId: env.accessControlId as string,
  versionsId: env.versionsId as string,
};

const client = new Client()
  .setEndpoint(config.endpoint)
  .setProject(config.projectId)
  .setKey(config.apiKey);

const databases = new Databases(client);

async function setup() {
  console.log('🚀 Starting Appwrite setup...');

  // 1. Create Database
  try {
    await databases.get(config.databaseId);
    console.log(`✅ Database "${config.databaseId}" already exists.`);
  } catch (error: unknown) {
    const appwriteError = error as AppwriteError;
    if (appwriteError.code === 404) {
      await databases.create(config.databaseId, config.databaseId);
      console.log(`✅ Database "${config.databaseId}" created.`);
    } else {
      throw error;
    }
  }

  const collections: CollectionDefinition[] = [
    {
      id: config.projectsId,
      name: 'Projects',
      attributes: [
        { key: 'name', type: 'string', size: 512, required: true },
        { key: 'description', type: 'string', size: 16384, required: true },
        { key: 'status', type: 'enum', elements: ['todo', 'in-progress', 'completed'], required: true },
        { key: 'daysPerWeek', type: 'float', required: false },
        { key: 'allocatedDays', type: 'integer', required: false },
        { key: 'isEncrypted', type: 'boolean', required: false },
      ]
    },
    {
      id: config.tasksId,
      name: 'Tasks',
      attributes: [
        { key: 'projectId', type: 'string', size: 36, required: true },
        { key: 'title', type: 'string', size: 256, required: true },
        { key: 'completed', type: 'boolean', required: false, default: false },
        { key: 'parentId', type: 'string', size: 36, required: false },
        { key: 'timeSpent', type: 'integer', required: false },
        { key: 'isTimerRunning', type: 'boolean', required: false },
        { key: 'timerStartedAt', type: 'string', size: 64, required: false },
        { key: 'timeEntries', type: 'string', size: 16384, required: false, array: true },
        { key: 'order', type: 'integer', required: false },
        { key: 'priority', type: 'enum', elements: ['low', 'medium', 'high', 'urgent'], required: false, default: 'medium' },
        { key: 'kanbanStatus', type: 'enum', elements: ['todo', 'in-progress', 'review', 'waiting', 'done'], required: false, default: 'todo' },
        { key: 'deadline', type: 'string', size: 64, required: false },
        { key: 'notes', type: 'string', size: 16384, required: false, array: true },
        { key: 'isEncrypted', type: 'boolean', required: false },
      ],
      indexes: [
        { key: 'idx_projectId', type: IndexType.Key, attributes: ['projectId'] }
      ]
    },
    {
      id: config.guidesId,
      name: 'Wiki Guides',
      attributes: [
        { key: 'title', type: 'string', size: 512, required: true },
        { key: 'description', type: 'string', size: 16384, required: true },
        { key: 'isEncrypted', type: 'boolean', required: false },
      ]
    },
    {
      id: config.installationsId,
      name: 'Installations',
      attributes: [
        { key: 'guideId', type: 'string', size: 36, required: true },
        { key: 'target', type: 'string', size: 512, required: true },
        { key: 'gitRepo', type: 'string', size: 512, required: false },
        { key: 'documentation', type: 'string', size: 512, required: false },
        { key: 'notes', type: 'string', size: 16384, required: false },
        { key: 'tasks', type: 'string', size: 512, required: false, array: true },
        { key: 'isEncrypted', type: 'boolean', required: false },
        { key: 'iv', type: 'string', size: 32, required: false },
      ],
      indexes: [
        { key: 'idx_guideId', type: IndexType.Key, attributes: ['guideId'] }
      ]
    },
    {
      id: config.userKeysId,
      name: 'User Keys',
      attributes: [
        { key: 'userId', type: 'string', size: 36, required: true },
        { key: 'email', type: 'string', size: 128, required: false },
        { key: 'publicKey', type: 'string', size: 1024, required: true },
        { key: 'encryptedPrivateKey', type: 'string', size: 2048, required: true },
        { key: 'salt', type: 'string', size: 32, required: true },
        { key: 'iv', type: 'string', size: 32, required: true },
      ],
      indexes: [
        { key: 'idx_userId', type: IndexType.Key, attributes: ['userId'] },
        { key: 'idx_email', type: IndexType.Key, attributes: ['email'] }
      ]
    },
    {
      id: config.accessControlId,
      name: 'Access Control',
      attributes: [
        { key: 'resourceId', type: 'string', size: 36, required: true },
        { key: 'userId', type: 'string', size: 36, required: true },
        { key: 'encryptedKey', type: 'string', size: 1024, required: true },
        { key: 'resourceType', type: 'string', size: 32, required: true },
      ],
      indexes: [
        { key: 'idx_resourceUser', type: IndexType.Key, attributes: ['resourceId', 'userId'] }
      ]
    },
    {
      id: config.activityId,
      name: 'Activity',
      attributes: [
        { key: 'type', type: 'string', size: 32, required: true },
        { key: 'entityType', type: 'string', size: 32, required: true },
        { key: 'entityName', type: 'string', size: 128, required: true },
        { key: 'projectId', type: 'string', size: 36, required: false },
        { key: 'metadata', type: 'string', size: 128, required: false },
      ],
      indexes: [
        { key: 'idx_projectId', type: IndexType.Key, attributes: ['projectId'] }
      ]
    },
    {
      id: config.snippetsId,
      name: 'Snippets',
      attributes: [
        { key: 'title', type: 'string', size: 512, required: true },
        { key: 'content', type: 'string', size: 16384, required: true },
        { key: 'blocks', type: 'string', size: 16384, required: false },
        { key: 'language', type: 'string', size: 32, required: true },
        { key: 'tags', type: 'string', size: 255, required: false, array: true },
        { key: 'description', type: 'string', size: 1024, required: false },
        { key: 'isEncrypted', type: 'boolean', required: false },
      ]
    },
    {
      id: config.versionsId,
      name: 'Resource Versions',
      attributes: [
        { key: 'resourceId', type: 'string', size: 36, required: true },
        { key: 'resourceType', type: 'string', size: 16, required: true },
        { key: 'content', type: 'string', size: 16384, required: true },
        { key: 'title', type: 'string', size: 512, required: false },
        { key: 'metadata', type: 'string', size: 1024, required: false },
        { key: 'isEncrypted', type: 'boolean', required: false },
      ],
      indexes: [
        { key: 'idx_resourceId', type: IndexType.Key, attributes: ['resourceId'] }
      ]
    }
  ];

  for (const collection of collections) {
    console.log(`\n📦 Processing collection: ${collection.name} (${collection.id})`);
    try {
      await databases.getCollection(config.databaseId, collection.id);
      console.log(`  ✅ Collection exists. Syncing permissions...`);
      
      // Default permissions: Any authenticated user can create. 
      // DLS handles specific access via creation/update permissions.
      const permissions = [Permission.create(Role.users())];
      
      await databases.updateCollection(
        config.databaseId,
        collection.id,
        collection.name,
        permissions,
        true // Enable Document Level Security
      );
    } catch (error: unknown) {
      const appwriteError = error as AppwriteError;
      if (appwriteError.code === 404) {
        const permissions = [Permission.create(Role.users())];
        
        await databases.createCollection(
          config.databaseId,
          collection.id,
          collection.name,
          permissions,
          true // Enable Document Level Security
        );
        console.log(`  ✅ Collection created with document-level security.`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.error(`  ❌ Error fetching collection ${collection.id}:`, appwriteError.message);
        continue;
      }
    }

    const currentCollection = await databases.getCollection(config.databaseId, collection.id);
    const existingAttributes = currentCollection.attributes as unknown as { key: string; status: string }[];
    const existingIndexes = currentCollection.indexes.map((i: { key: string }) => i.key);

    for (const attr of collection.attributes) {
      const existingAttr = existingAttributes.find(a => a.key === attr.key);
      const exists = !!existingAttr;
      const isAvailable = existingAttr?.status === 'available';

      if (exists && !isAvailable) {
        console.log(`  ⚠️ Attribute "${attr.key}" exists but is in status "${existingAttr.status}". Attempting cleanup...`);
        try {
          await databases.deleteAttribute(config.databaseId, collection.id, attr.key);
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch {
          console.error(`  ❌ Failed to cleanup broken attribute "${attr.key}"`);
        }
      }

      console.log(`  ${(exists && isAvailable) ? '🔄 Syncing' : '➕ Creating'} attribute "${attr.key}"...`);
      try {
        const defaultValue = attr.default !== undefined ? attr.default : null;
        
        switch (attr.type) {
          case 'string':
            if (exists && isAvailable) {
              // @ts-expect-error appwrite typings issue
              await databases.updateStringAttribute(config.databaseId, collection.id, attr.key, attr.required, defaultValue as string | null);
            } else {
              // @ts-expect-error appwrite typings issue
              await databases.createStringAttribute(config.databaseId, collection.id, attr.key, attr.size || 255, attr.required, defaultValue as string | null, attr.array);
            }
            break;
          case 'integer':
            if (exists && isAvailable) {
              // @ts-expect-error appwrite typings issue
              await databases.updateIntegerAttribute(config.databaseId, collection.id, attr.key, attr.required, null, null, defaultValue as number | null);
            } else {
              // @ts-expect-error appwrite typings issue
              await databases.createIntegerAttribute(config.databaseId, collection.id, attr.key, attr.required, undefined, undefined, defaultValue as number | null, attr.array);
            }
            break;
          case 'float':
            if (exists && isAvailable) {
              // @ts-expect-error appwrite typings issue
              await databases.updateFloatAttribute(config.databaseId, collection.id, attr.key, attr.required, null, null, defaultValue as number | null);
            } else {
              // @ts-expect-error appwrite typings issue
              await databases.createFloatAttribute(config.databaseId, collection.id, attr.key, attr.required, undefined, undefined, defaultValue as number | null, attr.array);
            }
            break;
          case 'boolean':
            if (exists && isAvailable) {
              // @ts-expect-error appwrite typings issue
              await databases.updateBooleanAttribute(config.databaseId, collection.id, attr.key, attr.required, defaultValue as boolean | null);
            } else {
              // @ts-expect-error appwrite typings issue
              await databases.createBooleanAttribute(config.databaseId, collection.id, attr.key, attr.required, defaultValue as boolean | null, attr.array);
            }
            break;
          case 'enum':
            if (exists && isAvailable) {
              // @ts-expect-error appwrite typings issue
              await databases.updateEnumAttribute(config.databaseId, collection.id, attr.key, attr.elements!, attr.required, defaultValue as string | null);
            } else {
              // @ts-expect-error appwrite typings issue
              await databases.createEnumAttribute(config.databaseId, collection.id, attr.key, attr.elements!, attr.required, defaultValue as string | null, attr.array);
            }
            break;
        }
      } catch (error: unknown) {
        const appwriteError = error as AppwriteError;
        console.error(`  ❌ Failed to process attribute "${attr.key}":`, appwriteError.message);
      }
    }

    // Process Indexes
    if (collection.indexes) {
      for (const index of collection.indexes) {
        if (existingIndexes.includes(index.key)) {
          console.log(`  🟡 Index "${index.key}" already exists.`);
          continue;
        }

        console.log(`  ➕ Creating index "${index.key}"...`);
        try {
          await databases.createIndex(config.databaseId, collection.id, index.key, index.type, index.attributes);
        } catch (error: unknown) {
          const appwriteError = error as AppwriteError;
          console.error(`  ❌ Failed to create index "${index.key}":`, appwriteError.message);
        }
      }
    }
  }

  console.log('\n✨ Appwrite setup completed!');
}

setup().catch(console.error);

