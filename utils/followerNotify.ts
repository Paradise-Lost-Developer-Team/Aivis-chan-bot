import axios from 'axios';
import { voiceSettings } from './TTS-Engine';

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

// プライマリ側で voiceSettings を直接送信する: フォロワーが PRIMARY_URL を参照する構成と
// 混在していると同期がとれないケースがあるため、ここで最新の設定をペイロードで送る。
export async function sendVoiceSettingsUpdateToFollowers(opts: FollowerNotifyOptions = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const fromName = process.env.SERVICE_NAME || 'pro-premium';
  const payload = { from: fromName, voiceSettings };

  const promises = FOLLOWERS.map(async (baseUrl) => {
    try {
      const url = baseUrl.replace(/\/$/, '') + '/internal/voice-settings-refresh';
      await axios.post(url, payload, { timeout: timeoutMs });
      console.log(`フォロワーへ設定ペイロード送信成功: ${url}`);
    } catch (e: any) {
      console.warn(`フォロワーへの設定送信に失敗しました: ${baseUrl} -> ${e?.message || e}`);
    }
  });
  await Promise.all(promises);
}

export default sendVoiceSettingsUpdateToFollowers;
