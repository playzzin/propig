"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.FIRESTORE_DATABASE_ID = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.FIRESTORE_DATABASE_ID = ((_a = process.env.FIRESTORE_DATABASE_ID) === null || _a === void 0 ? void 0 : _a.trim())
    || ((_b = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID) === null || _b === void 0 ? void 0 : _b.trim())
    || 'pppp';
exports.db = (0, firestore_1.getFirestore)(admin.app(), exports.FIRESTORE_DATABASE_ID);
//# sourceMappingURL=firestore.js.map