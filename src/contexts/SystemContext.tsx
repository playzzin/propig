'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { sanitizeBrandAssetMap, sanitizeBrandAssetUrl } from '@/constants/brandAssets';

export interface SystemSettings {
    logoUrl?: string;
    envLogos?: Record<string, string>;
    faviconUrl?: string;
    envFavicons?: Record<string, string>;
    brandAssetsVersion?: number;
    updatedAt?: unknown;
    themeColor?: string;
    heroBannerUrl?: string;
}

interface SystemContextType {
    settings: SystemSettings;
    updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;
    updateEnvLogo: (siteId: string, logoUrl: string) => Promise<void>;
    loading: boolean;
    error: string | null;
    retry: () => void;
}

const SETTINGS_DOC = doc(db, 'system_settings', 'general');
const SystemContext = createContext<SystemContextType | undefined>(undefined);

function withNonEmptyMap(value: Record<string, string>) {
    return Object.keys(value).length > 0 ? value : deleteField();
}

function sanitizeSettingsSnapshot(data: Record<string, unknown>): SystemSettings {
    const envLogos = sanitizeBrandAssetMap(data.envLogos as Record<string, string | null | undefined> | undefined);
    const envFavicons = sanitizeBrandAssetMap(data.envFavicons as Record<string, string | null | undefined> | undefined);
    const logoUrl = sanitizeBrandAssetUrl(data.logoUrl as string | undefined);
    const faviconUrl = sanitizeBrandAssetUrl(data.faviconUrl as string | undefined);
    const brandAssetsVersion = Number(data.brandAssetsVersion);

    return {
        ...(logoUrl ? { logoUrl } : {}),
        ...(Object.keys(envLogos).length > 0 ? { envLogos } : {}),
        ...(faviconUrl ? { faviconUrl } : {}),
        ...(Object.keys(envFavicons).length > 0 ? { envFavicons } : {}),
        ...(Number.isFinite(brandAssetsVersion) ? { brandAssetsVersion } : {}),
        ...(typeof data.themeColor === 'string' && data.themeColor.trim() ? { themeColor: data.themeColor.trim() } : {}),
        ...(typeof data.heroBannerUrl === 'string' && data.heroBannerUrl.trim()
            ? { heroBannerUrl: data.heroBannerUrl.trim() }
            : {}),
        ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
    };
}

function buildSettingsUpdatePayload(newSettings: Partial<SystemSettings>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    let touchedBrandAssets = false;

    if ('logoUrl' in newSettings) {
        const logoUrl = sanitizeBrandAssetUrl(newSettings.logoUrl);
        payload.logoUrl = logoUrl || deleteField();
        touchedBrandAssets = true;
    }

    if ('faviconUrl' in newSettings) {
        const faviconUrl = sanitizeBrandAssetUrl(newSettings.faviconUrl);
        payload.faviconUrl = faviconUrl || deleteField();
        touchedBrandAssets = true;
    }

    if ('envLogos' in newSettings) {
        payload.envLogos = withNonEmptyMap(
            sanitizeBrandAssetMap(newSettings.envLogos as Record<string, string | null | undefined> | undefined),
        );
        touchedBrandAssets = true;
    }

    if ('envFavicons' in newSettings) {
        payload.envFavicons = withNonEmptyMap(
            sanitizeBrandAssetMap(newSettings.envFavicons as Record<string, string | null | undefined> | undefined),
        );
        touchedBrandAssets = true;
    }

    if ('themeColor' in newSettings) {
        const themeColor = newSettings.themeColor?.trim();
        payload.themeColor = themeColor || deleteField();
    }

    if ('heroBannerUrl' in newSettings) {
        const heroBannerUrl = newSettings.heroBannerUrl?.trim();
        payload.heroBannerUrl = heroBannerUrl || deleteField();
    }

    if (touchedBrandAssets) {
        payload.brandAssetsVersion = Date.now();
    }

    payload.updatedAt = serverTimestamp();
    return payload;
}

function isMissingDocumentError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'not-found'
    );
}

export function SystemProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<SystemSettings>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [subscriptionVersion, setSubscriptionVersion] = useState(0);

    useEffect(() => {
        let active = true;
        let unsubscribe: () => void = () => undefined;
        try {
            unsubscribe = onSnapshot(
                SETTINGS_DOC,
                (snapshot) => {
                    setSettings(
                        snapshot.exists()
                            ? sanitizeSettingsSnapshot(snapshot.data() as Record<string, unknown>)
                            : {},
                    );
                    setError(null);
                    setLoading(false);
                },
                (snapshotError) => {
                    console.error('[System Settings] Subscription failed.', snapshotError);
                    setError('시스템 설정을 불러오지 못했습니다. 기본 설정으로 계속합니다.');
                    setLoading(false);
                },
            );
        } catch (subscriptionError) {
            console.error('[System Settings] Subscription setup failed.', subscriptionError);
            queueMicrotask(() => {
                if (!active) return;
                setError('시스템 설정 연결을 시작하지 못했습니다.');
                setLoading(false);
            });
        }

        return () => {
            active = false;
            unsubscribe();
        };
    }, [subscriptionVersion]);

    const retry = () => {
        setLoading(true);
        setError(null);
        setSubscriptionVersion((version) => version + 1);
    };

    const updateSettings = async (newSettings: Partial<SystemSettings>) => {
        const payload = buildSettingsUpdatePayload(newSettings);
        try {
            await updateDoc(SETTINGS_DOC, payload);
        } catch (error) {
            if (!isMissingDocumentError(error)) {
                throw error;
            }

            await setDoc(SETTINGS_DOC, payload, { merge: true });
        }
    };

    const updateEnvLogo = async (siteId: string, logoUrl: string) => {
        await updateSettings({
            envLogos: {
                ...(settings.envLogos ?? {}),
                [siteId]: logoUrl,
            },
        });
    };

    return (
        <SystemContext.Provider value={{ settings, updateSettings, updateEnvLogo, loading, error, retry }}>
            {children}
        </SystemContext.Provider>
    );
}

export function useSystem() {
    const context = useContext(SystemContext);
    if (context === undefined) {
        throw new Error('useSystem must be used within a SystemProvider');
    }
    return context;
}
