
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Hardcoded config
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

async function scanDatabase() {
    console.log(`\n---------------------------------------------------`);
    console.log(`🔍 Scanning Database: ${firebaseConfig.databaseId}`);
    console.log(`---------------------------------------------------\n`);

    try {
        // 1. Get all users
        console.log("1. Fetching all users...");
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);

        if (usersSnap.empty) {
            console.log("   ❌ No users found in 'users' collection.");
            return;
        }

        console.log(`   found ${usersSnap.size} user(s). Checking for sticky notes...\n`);

        // 2. Check each user for stickyNotes
        let totalNotes = 0;

        for (const userDoc of usersSnap.docs) {
            const uid = userDoc.id;
            const notesRef = collection(db, 'users', uid, 'stickyNotes');
            try {
                const notesSnap = await getDocs(notesRef);
                const count = notesSnap.size;
                totalNotes += count;

                if (count > 0) {
                    console.log(`   👤 User [${uid}]: Found ${count} note(s).`);
                    notesSnap.docs.forEach(note => {
                        const data = note.data();
                        console.log(`      - Note [${note.id}]: "${data.content?.substring(0, 30)}..."`);
                    });
                } else {
                    console.log(`   👤 User [${uid}]: 0 notes.`);
                }
            } catch (err: any) {
                console.log(`   👤 User [${uid}]: ⚠️ Error reading notes: ${err.message}`);
            }
        }

        console.log(`\n---------------------------------------------------`);
        console.log(`TOTAL NOTES FOUND: ${totalNotes}`);
        console.log(`---------------------------------------------------\n`);

    } catch (error: any) {
        console.error("Scan Failed:", error);
    }
}

scanDatabase();
