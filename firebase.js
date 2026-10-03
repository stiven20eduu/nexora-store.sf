import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  // Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCW0MCzgikzsGGfy4MU7tCrDlAuS1RKnhs",
  authDomain: "nexora-store-6857a.firebaseapp.com",
  projectId: "nexora-store-6857a",
  storageBucket: "nexora-store-6857a.firebasestorage.app",
  messagingSenderId: "868281016747",
  appId: "1:868281016747:web:a9afa4397d0e883581b2ee",
  measurementId: "G-77DG50FEW8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };
