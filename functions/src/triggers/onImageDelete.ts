import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

if (!admin.apps.length) {
    admin.initializeApp();
}

export const onImageDelete = onDocumentDeleted('generated_images/{imageId}', async (event) => {
    const snap = event.data;
    if (!snap) {
        logger.warn('No data associated with the event');
        return;
    }

    const data = snap.data();
    const storagePath = data.storagePath;

    if (storagePath) {
        try {
            const bucket = admin.storage().bucket();
            const file = bucket.file(storagePath);
            const [exists] = await file.exists();

            if (exists) {
                await file.delete();
                logger.info(`Successfully deleted storage file: ${storagePath}`);
            } else {
                logger.warn(`File not found in storage: ${storagePath}`);
            }
        } catch (error) {
            logger.error(`Error deleting storage file: ${storagePath}`, error);
        }
    } else {
        logger.warn('Document deleted but no storagePath found in metadata.');
    }
});
