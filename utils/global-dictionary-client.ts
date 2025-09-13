import axios from 'axios';

export async function fetchAndMergeGlobalDictionary(guildId: string, webDashboardUrl: string): Promise<any[]> {
    try {
        const url = `${webDashboardUrl}/internal/global-dictionary/${guildId}`;
        const { data } = await axios.get(url, { timeout: 15000 });

        const globalArr: any[] = Array.isArray(data?.global) ? data.global : [];
        const localArr: any[] = Array.isArray(data?.local) ? data.local : [];

        // Merge: global first, then overlay local (local overrides)
        const map = new Map<string, any>();
        for (const e of globalArr) {
            if (e && e.word) map.set(e.word, e);
        }
        for (const e of localArr) {
            if (e && e.word) map.set(e.word, e);
        }

        return Array.from(map.values());
    } catch (err: any) {
        console.warn(`[global-dict] fetch error for guild ${guildId}:`, err?.message || err);
        return [];
    }
}

export default fetchAndMergeGlobalDictionary;
