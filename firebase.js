import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwCMCMzgikzsGGfy4MU7tCrDIAuS1RKnHs",
  authDomain: "nexora-store-6857a.firebaseapp.com",
  projectId: "nexora-store-6857a",
  storageBucket: "nexora-store-6857a.firebasestorage.app",
  messagingSenderId: "868281016747",
  appId: "1:868281016747:web:a9afa4397d0e883581b2ee",
  measurementId: "G-77DG50FEW8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };
