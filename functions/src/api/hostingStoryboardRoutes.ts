import * as admin from 'firebase-admin';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { ApiError, db, requireMethod, requireUser } from './hostingCommon';
import { createStoryboardDeletionHandler, StoryboardDeletionError } from './storyboardDeletion';

const deleteStoryboard = createStoryboardDeletionHandler(db, admin);

export async function handleStoryboardById(req: Request, res: Response, storyboardId: string): Promise<void> {
    requireMethod(req, 'DELETE');
    const auth = await requireUser(req);
    try {
        res.status(200).json(await deleteStoryboard(auth.uid, storyboardId));
    } catch (error) {
        if (error instanceof StoryboardDeletionError) throw new ApiError(error.status, error.message);
        throw error;
    }
}
