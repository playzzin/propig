
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDmBvprwfCFe49RZNL2ygCY-ukD6-abwws",
    authDomain: "propig-63524.firebaseapp.com",
    projectId: "propig-63524",
    storageBucket: "propig-63524.firebasestorage.app",
    messagingSenderId: "905560824324",
    appId: "1:905560824324:web:84f4cfe8ace51699173351",
    databaseId: "pppp"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "pppp");

async function fixVisibility() {
    console.log("🛠️ Creating a visible document in 'users'...");
    try {
        // Create a real document to make the collection visible
        await setDoc(doc(db, 'users', '_console_fix_'), {
            readme: "This document exists to make the 'users' collection visible in Console.",
            createdAt: new Date().toISOString()
        });
        console.log("✅ Success! Refresh your Firebase Console.");
        console.log("You should now see '_console_fix_' inside the 'users' list.");
    } catch (error: any) {
        console.error("❌ Failed:", error);
    }
}

fixVisibility();
