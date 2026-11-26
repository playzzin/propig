import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { localFirebase } from './browserDefaults';
import app from './config';

export const storage = getStorage(app);
if (localFirebase) {
  connectStorageEmulator(storage, localFirebase.host, localFirebase.storagePort);
}
