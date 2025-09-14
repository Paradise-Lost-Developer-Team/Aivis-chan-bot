import axios from 'axios';

export type FollowerNotifyOptions = {
  timeoutMs?: number;
};

// 通知先ボットのベースURL一覧。必要に応じて環境変数で上書き可能
const FOLLOWERS = process.env.FOLLOWER_BOTS ? process.env.FOLLOWER_BOTS.split(',') : [
  'http://aivis-chan-bot-2nd:3003',
  'http://aivis-chan-bot-3rd:3004',
  'http://aivis-chan-bot-4th:3005',
  'http://aivis-chan-bot-5th:3006',
  'http://aivis-chan-bot-6th:3007'
];

export async function sendVoiceSettingsUpdateToFollowers(opts: FollowerNotifyOptions = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const promises = FOLLOWERS.map(async (baseUrl) => {
    try {
      const url = baseUrl.replace(/\/$/, '') + '/internal/voice-settings-refresh';
      await axios.post(url, { from: 'pro-premium' }, { timeout: timeoutMs });
      console.log(`フォロワーへ通知送信成功: ${url}`);
    } catch (e: any) {
      console.warn(`フォロワーへの通知に失敗しました: ${baseUrl} -> ${e?.message || e}`);
    }
  });
  await Promise.all(promises);
}

export default sendVoiceSettingsUpdateToFollowers;
