import * as fs from 'fs';
import * as path from 'path';

interface SpeakerEntry {
    speakerId: number;
    style: string;
    displayName: string;
}

const SPEAKERS_FILE = path.join(process.cwd(), 'speakers_list.json');
let guildSpeakers: { [guildId: string]: SpeakerEntry[] } = {};

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
export function getGuildSpeakers(guildId: string): SpeakerEntry[] {
    if (!guildSpeakers[guildId]) {
        guildSpeakers[guildId] = [];
    }
    return guildSpeakers[guildId];
}

// 話者を追加
export function addSpeaker(guildId: string, speakerId: number, style: string, displayName: string) {
    const list = getGuildSpeakers(guildId);
    list.push({ speakerId, style, displayName });
    saveSpeakers();
}

// 話者を編集 (speakerId で検索)
export function editSpeaker(guildId: string, speakerId: number, newStyle: string, newDisplay: string) {
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
export function removeSpeaker(guildId: string, speakerId: number) {
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
