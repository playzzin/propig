import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import app from './config';

export const functions = getFunctions(app);

const shouldDebugFirebase =
  (process.env.NEXT_PUBLIC_DEBUG_FIREBASE ?? '').toLowerCase() === 'true';
const shouldUseFunctionsEmulator =
  (process.env.NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR ?? '').toLowerCase() === 'true' &&
  typeof window !== 'undefined';

if (shouldUseFunctionsEmulator) {
  const host = process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST || 'localhost';
  const portRaw = process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT || '5001';
  const port = Number(portRaw);

  if (Number.isFinite(port)) {
    connectFunctionsEmulator(functions, host, port);
    if (shouldDebugFirebase) {
      console.info(`[Firebase] Connected to Functions Emulator (${host}:${port})`);
    }
  } else {
    console.warn('[Firebase] Invalid NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT. Skipping emulator connection.', { portRaw });
  }
}
