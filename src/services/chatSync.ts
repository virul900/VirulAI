import { db, auth } from '../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { ChatMessage } from './geminiService';

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  pinned?: boolean;
  userId?: string;
  updatedAt?: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Migrates local chats to Firestore for a newly logged-in user.
 */
export async function migrateLocalChatsToCloud(userId: string, localChats: Chat[]) {
  if (!localChats || localChats.length === 0) return;
  
  try {
    const batch = writeBatch(db);
    // Only migrate chats that don't have a userId or belong to guest
    const chatsToMigrate = localChats.filter(chat => !chat.userId);
    
    if (chatsToMigrate.length === 0) return;

    for (const chat of chatsToMigrate) {
      const chatRef = doc(db, 'chats', chat.id);
      batch.set(chatRef, {
        id: chat.id,
        title: chat.title,
        messages: chat.messages || [],
        pinned: !!chat.pinned,
        userId: userId,
        updatedAt: new Date().getTime()
      });
    }

    await batch.commit();
    console.log(`Successfully migrated ${chatsToMigrate.length} chats to Cloud Firestore.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'chats');
  }
}

/**
 * Subscribes to the user's chats in Firestore.
 */
export function subscribeToUserChats(userId: string, onUpdate: (chats: Chat[]) => void) {
  const chatsRef = collection(db, 'chats');
  const q = query(chatsRef, where('userId', '==', userId));

  return onSnapshot(q, (snapshot) => {
    const chats: Chat[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      chats.push({
        id: data.id,
        title: data.title || 'New Topic',
        messages: data.messages || [],
        pinned: !!data.pinned,
        userId: data.userId,
        updatedAt: data.updatedAt
      });
    });
    onUpdate(chats);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'chats');
  });
}

/**
 * Saves or updates a single chat in Firestore.
 */
export async function saveChatToCloud(userId: string, chat: Chat) {
  const path = `chats/${chat.id}`;
  try {
    const chatRef = doc(db, 'chats', chat.id);
    await setDoc(chatRef, {
      id: chat.id,
      title: chat.title,
      messages: chat.messages || [],
      pinned: !!chat.pinned,
      userId: userId,
      updatedAt: new Date().getTime()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a chat from Firestore.
 */
export async function deleteChatFromCloud(chatId: string) {
  const path = `chats/${chatId}`;
  try {
    const chatRef = doc(db, 'chats', chatId);
    await deleteDoc(chatRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

