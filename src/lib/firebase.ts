import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Master Credentials
export const MASTER_USER = {
  username: 'wefd',
  password: 'Sara0519'
};

// Authenticate user against Master or Firestore app_users collection
export async function authenticateAppUser(usernameInput: string, passwordInput: string): Promise<{ success: boolean; username: string; error?: string }> {
  const cleanUsername = usernameInput.trim();
  
  // 1. Check Master user
  if (cleanUsername === MASTER_USER.username && passwordInput === MASTER_USER.password) {
    return { success: true, username: MASTER_USER.username };
  }

  // 2. Check in Firestore app_users collection
  try {
    const q = query(
      collection(db, 'app_users'),
      where('username', '==', cleanUsername),
      where('password', '==', passwordInput)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { success: true, username: cleanUsername };
    }
    return { success: false, username: cleanUsername, error: 'Usuario o contraseña incorrectos.' };
  } catch (err: any) {
    console.error('Auth check error:', err);
    return { success: false, username: cleanUsername, error: 'Error al verificar credenciales.' };
  }
}

// Create new App User in Firestore
export async function createAppUser(usernameInput: string, passwordInput: string): Promise<{ success: boolean; message: string }> {
  const cleanUsername = usernameInput.trim();
  if (!cleanUsername || !passwordInput) {
    return { success: false, message: 'Usuario y contraseña son obligatorios.' };
  }

  if (cleanUsername === MASTER_USER.username) {
    return { success: false, message: 'No se puede duplicar el usuario maestro.' };
  }

  try {
    const q = query(collection(db, 'app_users'), where('username', '==', cleanUsername));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { success: false, message: 'El nombre de usuario ya existe.' };
    }

    const docId = 'user_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    await setDoc(doc(db, 'app_users', docId), {
      username: cleanUsername,
      password: passwordInput,
      createdAt: new Date().toISOString()
    });

    return { success: true, message: `Usuario "${cleanUsername}" creado exitosamente.` };
  } catch (err: any) {
    console.error('Error creating app user:', err);
    return { success: false, message: 'Error al guardar el usuario en la base de datos.' };
  }
}
