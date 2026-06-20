"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onImageDelete = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.onImageDelete = (0, firestore_1.onDocumentDeleted)('generated_images/{imageId}', async (event) => {
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
            }
            else {
                logger.warn(`File not found in storage: ${storagePath}`);
            }
        }
        catch (error) {
            logger.error(`Error deleting storage file: ${storagePath}`, error);
        }
    }
    else {
        logger.warn('Document deleted but no storagePath found in metadata.');
    }
});
//# sourceMappingURL=onImageDelete.js.map