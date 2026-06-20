'use client';

import React from 'react';
import AgentChat from '@/components/AgentChat';

export default function AgentChatPage() {
    return (
        <main id="content-area" style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            <AgentChat />
        </main>
    );
}
