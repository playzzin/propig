'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';

export interface SystemSettings {
    logoUrl?: string;
    envLogos?: Record<string, string>;
    faviconUrl?: string;
    envFavicons?: Record<string, string>;
    themeColor?: string;
    heroBannerUrl?: string;
}

interface SystemContextType {
    settings: SystemSettings;
    updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;
    updateEnvLogo: (siteId: string, logoUrl: string) => Promise<void>;
    loading: boolean;
}

const SETTINGS_DOC = doc(db, 'system_settings', 'general');
const SystemContext = createContext<SystemContextType | undefined>(undefined);

export function SystemProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<SystemSettings>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onSnapshot(SETTINGS_DOC, (snapshot) => {
            if (snapshot.exists()) {
                setSettings(snapshot.data() as SystemSettings);
            } else {
                setSettings({});
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const updateSettings = async (newSettings: Partial<SystemSettings>) => {
        await setDoc(SETTINGS_DOC, newSettings, { merge: true });
    };

    const updateEnvLogo = async (siteId: string, logoUrl: string) => {
        await setDoc(
            SETTINGS_DOC,
            {
                envLogos: {
                    ...(settings.envLogos ?? {}),
                    [siteId]: logoUrl,
                },
            },
            { merge: true },
        );
    };

    return (
        <SystemContext.Provider value={{ settings, updateSettings, updateEnvLogo, loading }}>
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
