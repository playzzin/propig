import { NextRequest, NextResponse } from 'next/server';
import admin, { db } from '@/lib/firebase-admin';
import { requireUserAuth } from '@/lib/server/user-auth';
import {
    createStoryboardDeletionHandler,
    StoryboardDeletionError,
} from '../../../../../functions/src/api/storyboardDeletion';

export const runtime = 'nodejs';
const deleteStoryboard = createStoryboardDeletionHandler(db, admin);

export async function DELETE(request: NextRequest, context: { params: Promise<{ storyboardId: string }> }) {
    const auth = await requireUserAuth(request);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    try {
        return NextResponse.json(await deleteStoryboard(auth.uid, (await context.params).storyboardId));
    } catch (error) {
        const status = error instanceof StoryboardDeletionError ? error.status : 503;
        const message = error instanceof StoryboardDeletionError
            ? error.message
            : '프로젝트 정리를 완료하지 못했습니다. 잠시 후 삭제를 다시 시도해 주세요.';
        return NextResponse.json({ success: false, error: message }, { status });
    }
}
