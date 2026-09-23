'use client';

import { useCallback, useEffect, useState } from 'react';

export type DailyRecordLayout = 'detail' | 'simple';

const DAILY_RECORD_LAYOUT_STORAGE_KEY = 'habit-tracker:daily-record-layout';

function isDailyRecordLayoutValue(value: string | null): value is DailyRecordLayout {
  return value === 'detail' || value === 'simple';
}

export function useDailyRecordLayout(defaultLayout: DailyRecordLayout = 'simple') {
  const [dailyRecordLayout, setDailyRecordLayoutState] = useState<DailyRecordLayout>(defaultLayout);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedLayout = window.localStorage.getItem(DAILY_RECORD_LAYOUT_STORAGE_KEY);
      if (isDailyRecordLayoutValue(storedLayout)) {
        setDailyRecordLayoutState(storedLayout);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const setDailyRecordLayout = useCallback((layout: DailyRecordLayout) => {
    setDailyRecordLayoutState(layout);
    window.localStorage.setItem(DAILY_RECORD_LAYOUT_STORAGE_KEY, layout);
  }, []);

  return {
    dailyRecordLayout,
    setDailyRecordLayout,
  };
}
