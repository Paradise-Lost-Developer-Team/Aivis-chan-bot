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
exports.getGuildSpeakers = getGuildSpeakers;
exports.addSpeaker = addSpeaker;
exports.editSpeaker = editSpeaker;
exports.removeSpeaker = removeSpeaker;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const SPEAKERS_FILE = path.join(process.cwd(), 'speakers_list.json');
let guildSpeakers = {};
// データをロード
function loadSpeakers() {
    if (fs.existsSync(SPEAKERS_FILE)) {
        const data = fs.readFileSync(SPEAKERS_FILE, 'utf-8');
        guildSpeakers = JSON.parse(data);
    }
}
// データを保存
function saveSpeakers() {
    fs.writeFileSync(SPEAKERS_FILE, JSON.stringify(guildSpeakers, null, 2), 'utf-8');
}
// ギルドの話者リストを取得
function getGuildSpeakers(guildId) {
    if (!guildSpeakers[guildId]) {
        guildSpeakers[guildId] = [];
    }
    return guildSpeakers[guildId];
}
// 話者を追加
function addSpeaker(guildId, speakerId, style, displayName) {
    const list = getGuildSpeakers(guildId);
    list.push({ speakerId, style, displayName });
    saveSpeakers();
}
// 話者を編集 (speakerId で検索)
function editSpeaker(guildId, speakerId, newStyle, newDisplay) {
    const list = getGuildSpeakers(guildId);
    for (const s of list) {
        if (s.speakerId === speakerId) {
            s.style = newStyle || s.style;
            s.displayName = newDisplay || s.displayName;
            saveSpeakers();
            return true;
        }
    }
    return false;
}
// 話者を削除
function removeSpeaker(guildId, speakerId) {
    const list = getGuildSpeakers(guildId);
    const filtered = list.filter(s => s.speakerId !== speakerId);
    if (filtered.length !== list.length) {
        guildSpeakers[guildId] = filtered;
        saveSpeakers();
        return true;
    }
    return false;
}
loadSpeakers();
//# sourceMappingURL=speakerManager.js.map