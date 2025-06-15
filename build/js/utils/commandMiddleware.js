"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lintCommand = lintCommand;
exports.executeCommand = executeCommand;
const discord_js_1 = require("discord.js");
/**
 * コマンド定義の簡易Lint
 * - name, description が必須
 * - options があれば array であること
 */
function lintCommand(def) {
    if (!def.name || typeof def.name !== "string") {
        throw new Error("CommandLint: name が未定義か不正です");
    }
    if (!def.description || typeof def.description !== "string") {
        throw new Error("CommandLint: description が未定義か不正です");
    }
    if (def.options && !Array.isArray(def.options)) {
        throw new Error("CommandLint: options は配列で指定してください");
    }
}
/**
 * コマンド実行ラッパー
 * - lint→handler 呼び出し→例外キャッチ→自動通報
 */
async function executeCommand(interaction, def, handler) {
    try {
        lintCommand(def);
        await handler();
    }
    catch (err) {
        // エラー通知先チャンネル名
        const reportChannelName = "bot-errors";
        const guild = interaction.guild;
        const ch = guild?.channels.cache.find((c) => c.type === discord_js_1.ChannelType.GuildText && c.name === reportChannelName);
        const content = `❌ コマンド「${def.name}」実行中にエラー
ユーザー: ${interaction.user.tag}
エラー: ${err.message || err}`;
        if (ch) {
            await ch.send(content);
        }
        // ユーザーにも丁寧に返答
        if (!interaction.replied) {
            await interaction.reply({
                content: "内部エラーが発生しました。管理者に通知しました。",
                ephemeral: true,
            });
        }
        console.error(`executeCommand error in ${def.name}:`, err);
    }
}
//# sourceMappingURL=commandMiddleware.js.map