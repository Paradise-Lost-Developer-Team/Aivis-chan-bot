"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployCommands = void 0;
const v9_1 = require("discord-api-types/v9");
const rest_1 = require("@discordjs/rest");
const config_json_1 = require("../data/config.json");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
console.log("deploy-commands.tsを開始します");
// コマンドを読み込む共通関数
const loadCommands = async (sourcePath, client) => {
    console.log(`コマンドを読み込み中: ${sourcePath}`);
    const commands = [];
    // ディレクトリが存在しない場合は作成
    if (!node_fs_1.default.existsSync(sourcePath)) {
        node_fs_1.default.mkdirSync(sourcePath, { recursive: true });
        console.log(`ディレクトリを作成しました: ${sourcePath}`);
        return commands; // ディレクトリが新しく作成された場合は空の配列を返す
    }
    try {
        const commandFolders = node_fs_1.default.readdirSync(sourcePath);
        console.log(`フォルダ一覧: ${commandFolders}`);
        for (const folder of commandFolders) {
            const folderPath = node_path_1.default.join(sourcePath, folder);
            // ディレクトリかどうか確認
            if (!node_fs_1.default.statSync(folderPath).isDirectory())
                continue;
            const commandFiles = node_fs_1.default.readdirSync(folderPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
            for (const file of commandFiles) {
                const filePath = node_path_1.default.join(folderPath, file);
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
                    }
                    else {
                        console.log(`[WARNING] コマンド ${filePath} には必要な "data" プロパティがありません。`);
                    }
                }
                catch (error) {
                    console.error(`コマンド読み込みエラー ${filePath}:`, error);
                }
            }
        }
    }
    catch (error) {
        console.error(`コマンドディレクトリの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
    return commands;
};
// API経由でコマンドを登録する関数
const registerCommands = async (commands) => {
    if (commands.length === 0) {
        console.log('登録するコマンドがありません');
        return;
    }
    const rest = new rest_1.REST({ version: '9' }).setToken(config_json_1.TOKEN);
    try {
        console.log(`${commands.length}個のアプリケーション (/) コマンドの更新を開始しました。`);
        const data = await rest.put(v9_1.Routes.applicationCommands(config_json_1.clientId), { body: commands });
        console.log(`${data.length}個のアプリケーション（/）コマンドを同期しました。`);
    }
    catch (error) {
        console.error('コマンド登録エラー:', error);
    }
};
// クライアントからの実行用関数（インポート先から呼び出される）
const deployCommands = async (client) => {
    // 開発環境のソースコードからコマンドを読み込む
    const commands = await loadCommands(node_path_1.default.join(__dirname, '..', 'commands'), client);
    await registerCommands(commands);
};
exports.deployCommands = deployCommands;
//# sourceMappingURL=deploy-commands.js.map