import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCAgDJCW5r11UC02hwatvix3Q_Q76v0TBo",
  authDomain: "gen-lang-client-0390512862.firebaseapp.com",
  databaseURL: "https://gen-lang-client-0390512862-default-rtdb.firebaseio.com",
  projectId: "gen-lang-client-0390512862",
  storageBucket: "gen-lang-client-0390512862.firebasestorage.app",
  messagingSenderId: "537400478807",
  appId: "1:537400478807:web:48d1acce0c44211532e712",
  measurementId: "G-7SHDTFQH41",
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

/**
 * Secondary Firebase app used ONLY for admin-driven user creation.
 * Using a separate app keeps the admin's session intact — otherwise
 * createUserWithEmailAndPassword would sign the admin in as the new user.
 * Auth uses in-memory persistence so the secondary session never leaks.
 */
const SECONDARY = "secondary-admin";
const secondaryApp = getApps().find((a) => a.name === SECONDARY) ?? initializeApp(firebaseConfig, SECONDARY);
let secondaryAuthInstance;
try {
  secondaryAuthInstance = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
} catch {
  secondaryAuthInstance = getAuth(secondaryApp);
}
export const secondaryAuth = secondaryAuthInstance;
