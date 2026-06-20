'use client';

import React from 'react';
import StickyNotesBoard from '@/components/StickyNotesBoard';

export default function StickyNotesPage() {
  return (
    <main id="content-area" className="sticky-notes-page">
      <div className="sticky-notes-board-shell">
        <StickyNotesBoard />
      </div>
    </main>
  );
}
