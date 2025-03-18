import * as fs from 'fs';
import * as path from 'path';
import { DICTIONARY_FILE } from './TTS-Engine';

export const guildDictionary: { [key: string]: { [key: string]: any } } = {};

export function saveToDictionaryFile() {
    try {
        // ディレクトリ存在確認
        const dirname = path.dirname(DICTIONARY_FILE);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
        
        fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(guildDictionary, null, 4), "utf-8");
        console.log(`辞書ファイルを保存しました: ${DICTIONARY_FILE}`);
    } catch (error) {
        console.error(`辞書ファイル保存エラー (${DICTIONARY_FILE}):`, error);
    }
}

export function updateGuildDictionary(guildId: string, word: string, details: any) {
    if (!guildDictionary[guildId]) {
        guildDictionary[guildId] = {};
    }
    guildDictionary[guildId][word] = details;
    saveToDictionaryFile();
}

export const wordTypeChoices = [
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

export async function fetchUUIDsPeriodically() {
    while (true) {
        fetchAllUUIDs();
        await new Promise(resolve => setTimeout(resolve, 300000)); // 5分ごとに実行
    }
}

// UUIDを取得する関数を修正
export async function fetchAllUUIDs(): Promise<void> {
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
            } else if (response) {
                console.log(`Error fetching user dictionary: HTTP ${response.status}`);
            } else {
                console.log(`Failed to fetch user dictionary (null response)`);
            }
        } catch (fetchError) {
            console.log(`Attempt ${attempts} - Error fetching user dictionary: ${fetchError}`);
            // エラーを記録するだけで中断せず処理を継続
        }
        
        // ...existing code...
    } catch (error) {
        console.error("Failed to fetch UUIDs:", error);
        // エラーをログに記録するが、プロセスは中断しない
    }
}

export class ServerStatus {
    guildId: string;
    // guild_id保存先のファイルパス
    private GUILD_ID_FILE: string;
    
    constructor(guildId: string) {
        this.guildId = guildId;
        
        // プロジェクトルートディレクトリへのパスを取得
        const currentDir = __dirname;
        let projectRoot: string;
        
        if (currentDir.includes('build/js/utils') || currentDir.includes('build\\js\\utils')) {
            projectRoot = path.resolve(path.join(currentDir, '..', '..', '..'));
        } else if (currentDir.includes('/utils') || currentDir.includes('\\utils')) {
            projectRoot = path.resolve(path.join(currentDir, '..'));
        } else {
            projectRoot = process.cwd();
        }
        
        this.GUILD_ID_FILE = path.join(projectRoot, "guild_id.txt");
        console.log(`Guild ID ファイルパス: ${this.GUILD_ID_FILE}`);
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
            } catch (error) {
                console.error(`Error saving guild id to ${this.GUILD_ID_FILE}:`, error);
            }
        }
    }
}