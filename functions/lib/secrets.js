"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.grokApiKey = exports.geminiApiKey = void 0;
const params_1 = require("firebase-functions/params");
exports.geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
exports.grokApiKey = (0, params_1.defineSecret)('GROK_API_KEY');
//# sourceMappingURL=secrets.js.map