import { NextRequest } from 'next/server';
import admin from '@/lib/firebase-admin';

type UserAuthSuccess = {
    ok: true;
    uid: string;
    email?: string;
};

type UserAuthFailure = {
    ok: false;
    status: 401 | 500;
    message: string;
};

export type UserAuthResult = UserAuthSuccess | UserAuthFailure;

const parseBearerToken = (request: NextRequest): string | null => {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader) return null;

    const [scheme, token] = authHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return null;
    }

    return token.trim();
};

export const requireUserAuth = async (request: NextRequest): Promise<UserAuthResult> => {
    const token = parseBearerToken(request);
    if (!token) {
        return { ok: false, status: 401, message: 'Authorization Bearer token is required.' };
    }

    if (!admin.apps.length) {
        return { ok: false, status: 500, message: 'Firebase Admin is not initialized.' };
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        return {
            ok: true,
            uid: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : undefined,
        };
    } catch (error) {
        console.error('[User Auth Error] verifyIdToken failed:', error);
        return { ok: false, status: 401, message: 'The provided auth token is invalid.' };
    }
};
