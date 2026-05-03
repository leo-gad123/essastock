import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

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
