"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStoryboardById = handleStoryboardById;
const admin = require("firebase-admin");
const hostingCommon_1 = require("./hostingCommon");
const storyboardDeletion_1 = require("./storyboardDeletion");
const deleteStoryboard = (0, storyboardDeletion_1.createStoryboardDeletionHandler)(hostingCommon_1.db, admin);
async function handleStoryboardById(req, res, storyboardId) {
    (0, hostingCommon_1.requireMethod)(req, 'DELETE');
    const auth = await (0, hostingCommon_1.requireUser)(req);
    try {
        res.status(200).json(await deleteStoryboard(auth.uid, storyboardId));
    }
    catch (error) {
        if (error instanceof storyboardDeletion_1.StoryboardDeletionError)
            throw new hostingCommon_1.ApiError(error.status, error.message);
        throw error;
    }
}
//# sourceMappingURL=hostingStoryboardRoutes.js.map