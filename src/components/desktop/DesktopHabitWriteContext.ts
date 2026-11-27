import { createContext } from 'react';

export const DesktopHabitWriteContext = createContext<(() => void) | undefined>(undefined);
