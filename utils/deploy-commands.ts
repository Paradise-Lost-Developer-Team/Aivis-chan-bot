import { Routes } from 'discord-api-types/v9';
import { REST } from '@discordjs/rest';
import { ExtendedClient } from '../index';
import fs from 'node:fs';
import path from 'node:path';
import { logError } from './errorLogger';

// ビルド時には設定ファイルが存在しないため、動的インポートを使用
let clientId: string = '';
let TOKEN: string = '';

try {
    if (fs.existsSync(path.join(__dirname, '..', 'data', 'config.json'))) {
        const config = require('../data/config.json');
        clientId = config.clientId;
        TOKEN = config.TOKEN;
    } else {
        // ビルド時や設定ファイルが存在しない場合のフォールバック
        console.log('設定ファイルが見つかりません。環境変数から読み込みます。');
        clientId = process.env.CLIENT_ID || '';
        TOKEN = process.env.DISCORD_TOKEN || '';
    }
} catch (error) {
    console.log('設定ファイルの読み込みに失敗しました。環境変数から読み込みます。');
    clientId = process.env.CLIENT_ID || '';
    TOKEN = process.env.DISCORD_TOKEN || '';
}
console.log("deploy-commands.tsを開始します");
// コマンドを読み込む共通関数
const loadCommands = async (sourcePath: string, client?: ExtendedClient): Promise<any[]> => {
    console.log(`コマンドを読み込み中: ${sourcePath}`);
    const commands: any[] = [];
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(sourcePath)) {
        fs.mkdirSync(sourcePath, { recursive: true });
        console.log(`ディレクトリを作成しました: ${sourcePath}`);
        return commands; // ディレクトリが新しく作成された場合は空の配列を返す
    }
    try {
        const commandFolders = fs.readdirSync(sourcePath);
        console.log(`フォルダ一覧: ${commandFolders}`);
        for (const folder of commandFolders) {
            const folderPath = path.join(sourcePath, folder);
            // ディレクトリかどうか確認
            if (!fs.statSync(folderPath).isDirectory()) continue;
            const commandFiles = fs.readdirSync(folderPath).filter(file => 
                file.endsWith('.js') || file.endsWith('.ts')
            );
            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                console.log(`コマンドを読み込み: ${filePath}`);
                try {
                    const command = require(filePath);
                    // クライアントが指定されていて、コマンドが有効な場合はクライアントに登録
                    if (client && 'data' in command && 'execute' in command) {
                        client.commands.set(command.data.name, command);
                        console.log(`クライアントにコマンドを登録: ${command.data.name}`);
                    }
                    // コマンドデータがある場合は配列に追加
                    if ('data' in command) {
                        commands.push(command.data.toJSON());
                        console.log(`コマンドをデプロイリストに追加: ${command.data.name}`);
                    } else {
                        console.log(`[WARNING] コマンド ${filePath} には必要な "data" プロパティがありません。`);
                    } 
                } catch (error) {
                    console.error(`コマンド読み込みエラー ${filePath}:`, error);
                }
            }
        }
    } catch (error) {
        console.error(`コマンドディレクトリの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
    return commands;
};
// API経由でコマンドを登録する関数
const registerCommands = async (commands: any[]) => {
    if (commands.length === 0) {
        console.log('登録するコマンドがありません');
        return;
    }

    // 設定値の検証
    if (!clientId || !TOKEN) {
        console.log('設定が不完全です。コマンド登録をスキップします。');
        console.log(`clientId: ${clientId ? '設定済み' : '未設定'}, TOKEN: ${TOKEN ? '設定済み' : '未設定'}`);
        return;
    }

    const rest = new REST({ version: '9' }).setToken(TOKEN);
    try {
        console.log(`${commands.length}個のアプリケーション (/) コマンドの更新を開始しました。`);
        const data: any = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );
        console.log(`${data.length}個のアプリケーション（/）コマンドを同期しました。`);
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
};

// --- 以下は自動生成されたグローバルコマンド削除ユーティリティ ---
// API経由でグローバルコマンドをすべて削除する関数
const clearGlobalCommands = async () => {
    // 設定値の検証
    if (!clientId || !TOKEN) {
        console.log('設定が不完全です。グローバルコマンド削除をスキップします。');
        console.log(`clientId: ${clientId ? '設定済み' : '未設定'}, TOKEN: ${TOKEN ? '設定済み' : '未設定'}`);
        return;
    }

    const rest = new REST({ version: '9' }).setToken(TOKEN);
    try {
        console.log('グローバルコマンドの全削除を開始します。');
        const data: any = await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] },
        );
        console.log('グローバルコマンドをクリアしました。現在のコマンド数:', Array.isArray(data) ? data.length : 'unknown');
    } catch (error) {
        console.error('グローバルコマンド削除エラー:', error);
    }
};

// クライアントからの実行用関数（インポート先から呼び出される）
export const deployCommands = async (client: ExtendedClient) => {
    // 開発環境のソースコードからコマンドを読み込む
    const commands = await loadCommands(path.join(__dirname, '..', 'commands'), client);
    await registerCommands(commands);
};

export { clearGlobalCommands };