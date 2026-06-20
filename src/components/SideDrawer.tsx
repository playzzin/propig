'use client';

import React from 'react';
import { getSwitchableSiteEntries } from '@/constants/accountMenu';
import { useMenuSitesQuery } from '@/hooks/useMenuSitesQuery';

interface SideDrawerProps {
    isActive: boolean;
    closeDrawer: () => void;
    currentEnv: string;
    switchEnv: (env: string) => void;
}

export default function SideDrawer({ isActive, closeDrawer, currentEnv, switchEnv }: SideDrawerProps) {
    const { data: sites = {} } = useMenuSitesQuery();
    const siteEntries = getSwitchableSiteEntries(sites);

    return (
        <>
            <div
                className={`backdrop ${isActive ? 'active' : ''}`}
                onClick={closeDrawer}
            />
            <aside
                id="drawer"
                className={`side-drawer ${isActive ? 'active' : ''}`}
            >
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 800 }}>작업 환경 전환</h3>
                    <button className="toggle-btn" onClick={closeDrawer}><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div style={{ padding: '24px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>접속하고자 하는 비즈니스 환경을 선택하십시오.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} id="env-grid">
                        {siteEntries.map(([siteId, site]) => (
                            <div
                                key={siteId}
                                onClick={() => { switchEnv(siteId); }}
                                style={{
                                    padding: '16px', textAlign: 'center', cursor: 'pointer',
                                    borderColor: siteId === currentEnv ? (site.color || 'var(--primary)') : 'var(--border-subtle)',
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    background: 'var(--bg-card)', borderRadius: '20px',
                                    transition: 'var(--transition)'
                                }}
                            >
                                <i className={`fa-solid fa-${site.icon || 'globe'}`} style={{ fontSize: '1.5rem', color: site.color || 'var(--primary)', marginBottom: '8px', display: 'block' }}></i>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{site.name}</span>
                            </div>
                        ))}
                    </div>

                    {siteEntries.length === 0 && (
                        <p style={{ marginTop: '12px', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                            등록된 사이트모드가 없습니다.
                        </p>
                    )}

                    <div style={{ marginTop: '40px' }}>
                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '16px' }}>개인화 설정</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button className="nav-btn" style={{ background: 'rgba(255,255,255,0.03)', justifyContent: 'space-between' }}>다크 모드 <span>ON</span></button>
                            <button className="nav-btn" style={{ background: 'rgba(255,255,255,0.03)', justifyContent: 'space-between' }}>언어 설정 <span>한국어</span></button>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
