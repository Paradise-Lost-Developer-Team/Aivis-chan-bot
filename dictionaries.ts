import * as fs from 'fs';

export const guildDictionary: { [key: string]: { [key: string]: any } } = {};

const DICTIONARY_FILE = "guilddictionaries.json";

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

export async function fetchAllUUIDs(retries = 3): Promise<{ [key: string]: any }> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch("http://localhost:10101/user_dict");
            if (!response.ok) {
                throw new Error(`Error fetching user dictionary: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${attempt} - Error fetching user dictionary:`, error);
            if (attempt === retries) {
                return {};
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
        }
    }
    return {};
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