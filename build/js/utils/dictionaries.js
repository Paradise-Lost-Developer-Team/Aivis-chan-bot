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
exports.ServerStatus = exports.wordTypeChoices = exports.guildDictionary = void 0;
exports.loadToDictionaryFile = loadToDictionaryFile;
exports.saveToDictionaryFile = saveToDictionaryFile;
exports.updateGuildDictionary = updateGuildDictionary;
exports.fetchUUIDsPeriodically = fetchUUIDsPeriodically;
exports.fetchAllUUIDs = fetchAllUUIDs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const TTS_Engine_1 = require("./TTS-Engine");
exports.guildDictionary = {};
function loadToDictionaryFile() {
    try {
        if (fs.existsSync(TTS_Engine_1.DICTIONARY_FILE)) {
            const data = fs.readFileSync(TTS_Engine_1.DICTIONARY_FILE, "utf-8");
            const parsed = JSON.parse(data);
            Object.assign(exports.guildDictionary, parsed);
            console.log(`辞書ファイルを読み込みました: ${TTS_Engine_1.DICTIONARY_FILE}`);
        }
        else {
            console.log(`辞書ファイルが存在しません: ${TTS_Engine_1.DICTIONARY_FILE}`);
        }
    }
    catch (error) {
        console.error(`辞書ファイル読み込みエラー (${TTS_Engine_1.DICTIONARY_FILE}):`, error);
    }
}
function saveToDictionaryFile() {
    try {
        // ディレクトリ存在確認
        const dirname = path.dirname(TTS_Engine_1.DICTIONARY_FILE);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
        fs.writeFileSync(TTS_Engine_1.DICTIONARY_FILE, JSON.stringify(exports.guildDictionary, null, 4), "utf-8");
        console.log(`辞書ファイルを保存しました: ${TTS_Engine_1.DICTIONARY_FILE}`);
    }
    catch (error) {
        console.error(`辞書ファイル保存エラー (${TTS_Engine_1.DICTIONARY_FILE}):`, error);
    }
}
function updateGuildDictionary(guildId, word, details) {
    if (!exports.guildDictionary[guildId]) {
        exports.guildDictionary[guildId] = {};
    }
    exports.guildDictionary[guildId][word] = details;
    saveToDictionaryFile();
}
exports.wordTypeChoices = [
    { name: "固有名詞", value: "PROPER_NOUN" },
    { name: "地名", value: "LOCATION_NAME" },
    { name: "組織・施設名", value: "ORGANIZATION_NAME" },
    { name: "人名", value: "PERSON_NAME" },
    { name: "性", value: "PERSON_FAMILY_NAME" },
    { name: "名", value: "PERSON_GIVEN_NAME" },
    { name: "一般名詞", value: "COMMON_NOUN" },
    { name: "動詞", value: "VERB" },
    { name: "形容詞", value: "ADJECTIVE" },
    { name: "語尾", value: "SUFFIX" }
];
async function fetchUUIDsPeriodically() {
    while (true) {
        fetchAllUUIDs();
        await new Promise(resolve => setTimeout(resolve, 300000)); // 5分ごとに実行
    }
}
// UUIDを取得する関数を修正
async function fetchAllUUIDs() {
    try {
        const attempts = 1; // Initialize attempt counter
        console.log("Attempt " + attempts + " - Fetching user dictionary...");
        // タイムアウト付きのフェッチを実装
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒でタイムアウト
        try {
            const response = await fetch('https://api.mojang.com/users/profiles/minecraft/nickname', {
                signal: controller.signal
            }).catch(err => {
                console.log(`Fetch error caught: ${err.message}`);
                return null; // エラー時にnullを返してフローを継続
            });
            clearTimeout(timeoutId); // タイムアウトをクリア
            if (response && response.ok) {
                const data = await response.json();
                // 処理を続行...
            }
            else if (response) {
                console.log(`Error fetching user dictionary: HTTP ${response.status}`);
            }
            else {
                console.log(`Failed to fetch user dictionary (null response)`);
            }
        }
        catch (fetchError) {
            console.log(`Attempt ${attempts} - Error fetching user dictionary: ${fetchError}`);
            // エラーを記録するだけで中断せず処理を継続
        }
        // ...existing code...
    }
    catch (error) {
        console.error("Failed to fetch UUIDs:", error);
        // エラーをログに記録するが、プロセスは中断しない
    }
}
class ServerStatus {
    constructor(guildId) {
        this.guildId = guildId;
        // プロジェクトルートディレクトリへのパスを取得
        const currentDir = __dirname;
        let projectRoot;
        if (currentDir.includes('build/js/utils') || currentDir.includes('build\\js\\utils')) {
            projectRoot = path.resolve(path.join(currentDir, '..', '..', '..'));
        }
        else if (currentDir.includes('/utils') || currentDir.includes('\\utils')) {
            projectRoot = path.resolve(path.join(currentDir, '..'));
        }
        else {
            projectRoot = process.cwd();
        }
        this.GUILD_ID_FILE = path.join(projectRoot, "guild_id.txt");
        this.saveTask();
    }
    async saveTask() {
        while (true) {
            try {
                // ディレクトリ存在確認
                const dirname = path.dirname(this.GUILD_ID_FILE);
                if (!fs.existsSync(dirname)) {
                    fs.mkdirSync(dirname, { recursive: true });
                }
                fs.writeFileSync(this.GUILD_ID_FILE, this.guildId);
                await new Promise(resolve => setTimeout(resolve, 60000)); // 60秒ごとに保存
            }
            catch (error) {
                console.error(`Error saving guild id to ${this.GUILD_ID_FILE}:`, error);
            }
        }
    }
}
exports.ServerStatus = ServerStatus;
//# sourceMappingURL=dictionaries.js.map