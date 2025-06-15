"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSentry = initSentry;
exports.captureException = captureException;
const Sentry = __importStar(require("@sentry/node"));
const node_1 = require("@sentry/node");
const errorLogger_1 = require("./errorLogger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// 設定を読み込む関数
function loadConfig() {
    try {
        const configPath = path.resolve(__dirname, '../data/config.json');
        const configFile = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configFile);
    }
    catch (error) {
        console.error('config.jsonの読み込みに失敗しました:', error);
        return { sentry: { enabled: false } };
    }
}
/**
 * Sentryを初期化する
 */
function initSentry() {
    const config = loadConfig();
    const sentryConfig = config.sentry || {};
    // Sentryが有効でなければ初期化しない
    if (!sentryConfig.enabled) {
        console.log('Sentry is disabled in config');
        return;
    }
    // 設定ファイルからDSNを使用、なければ環境変数を使用
    const dsn = sentryConfig.dsn || process.env.SENTRY_DSN;
    if (!dsn) {
        console.warn('Sentry DSNが設定されていません。Sentryは初期化されませんでした。');
        return;
    }
    Sentry.init({
        dsn: dsn,
        integrations: [
            (0, node_1.httpIntegration)(),
            (0, node_1.modulesIntegration)(),
        ],
        tracesSampleRate: sentryConfig.tracesSampleRate || 1.0,
        environment: sentryConfig.environment || process.env.NODE_ENV || 'development',
        // リリース情報を追加
        release: sentryConfig.release || process.env.npm_package_version || '0.0.0',
        // パフォーマンスモニタリングは tracesSampleRate で制御されます
    });
    console.log('Sentry initialized');
}
// 残りの実装は変更なし
function captureException(error, context) {
    if (context) {
        Sentry.withScope(scope => {
            scope.setTag('context', context);
            if (typeof error === 'string') {
                Sentry.captureMessage(error, 'error');
            }
            else {
                Sentry.captureException(error);
            }
        });
    }
    else {
        Sentry.captureException(error);
    }
    // 既存のエラーロガーも呼び出す
    (0, errorLogger_1.logError)(context || 'unknown', error instanceof Error ? error : new Error(String(error)));
}
//# sourceMappingURL=sentry.js.map