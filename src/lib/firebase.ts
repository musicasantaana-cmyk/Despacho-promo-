import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const ENV_CHECKS: ReadonlyArray<readonly [string, string | undefined]> = [
  ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['VITE_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
  ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
];

const missingEnvVars = ENV_CHECKS
  .filter(([, value]) => !value || String(value).trim() === '')
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  console.warn(
    `[Firebase] Faltan variables de entorno de Vite (${missingEnvVars.join(', ')}). Configúralas en tu archivo .env o en Environment Variables de Vercel para conectar con Firebase ("promodespacho").`
  );
}

const hasCoreConfig = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

export const isFirebaseConfigured = hasCoreConfig;

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

try {
  const safeInitConfig = hasCoreConfig
    ? firebaseConfig
    : {
        ...firebaseConfig,
        apiKey: firebaseConfig.apiKey || 'missing-api-key',
        authDomain: firebaseConfig.authDomain || 'missing-auth-domain',
        projectId: firebaseConfig.projectId || 'missing-project-id',
        appId: firebaseConfig.appId || 'missing-app-id',
      };

  app = getApps().length > 0 ? getApp() : initializeApp(safeInitConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.warn(
    '[Firebase] No se pudo inicializar Firebase SDK. Verifica las variables VITE_FIREBASE_* en el entorno de ejecución.',
    error
  );
  app = undefined as unknown as FirebaseApp;
  db = undefined as unknown as Firestore;
  auth = undefined as unknown as Auth;
}

export { app, db, auth };

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
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
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  const currentUser = auth?.currentUser ?? null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  if (!hasCoreConfig || !db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn(
        '[Firebase] No se pudo conectar con Firestore en el proyecto configurado. Verifica que Cloud Firestore API (firestore.googleapis.com), la base (default) y las restricciones de la API Key estén habilitadas.'
      );
    }
  }
}

if (hasCoreConfig) {
  testConnection();
}
