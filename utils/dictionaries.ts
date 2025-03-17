import * as fs from 'fs';

export const guildDictionary: { [key: string]: { [key: string]: any } } = {};

const DICTIONARY_FILE = "guild_dictionaries.json";

export function saveToDictionaryFile() {
    fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(guildDictionary, null, 4), "utf-8");
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
            });
            
            clearTimeout(timeoutId); // タイムアウトをクリア
            
            if (response.ok) {
                const data = await response.json();
                // 以降の処理...
            } else {
                console.log(`Error fetching user dictionary: HTTP ${response.status}`);
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
    constructor(guildId: string) {
        this.guildId = guildId;
        this.saveTask();
        }

    async saveTask() {
        while (true) {
            console.log(`Saving guild id: ${this.guildId}`);
            try {
                fs.writeFileSync('guild_id.txt', this.guildId); // guild_id をファイルに保存
                await new Promise(resolve => setTimeout(resolve, 60000)); // 60秒ごとに保存
            } catch (error: any) {
                console.error("Error saving guild id:", error);
            }
        }
    }
}