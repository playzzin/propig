'use client';

import React from 'react';
import Dashboard from '@/components/Dashboard';
import DashboardPhotoMarquee from '@/components/dashboard/DashboardPhotoMarquee';

export default function Dashboard2Page() {
    return (
        <Dashboard
            title="비주얼 대시보드"
            description="상단 슬라이드 섹션과 함께 주요 페이지를 바로 이동할 수 있는 대시보드입니다."
            topSlot={<DashboardPhotoMarquee />}
        />
    );
}