import { Bot } from "grammy";
import { type ModelMessage } from "ai";
import { PROGRESS_MESSAGES, runAgent } from "./agent.ts";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN ?? "");
const sessions = new Map<number, ModelMessage[]>();

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

bot.command("new", (ctx) => {
	sessions.delete(ctx.chat.id);
	ctx.reply("Session cleared. Starting fresh conversation.");
});

bot.api.setMyCommands([
	{ command: "start", description: "Start the bot" },
	{ command: "new", description: "Start fresh conversation" },
]);

bot.on("message:text", async (ctx) => {
	console.log(`[${ctx.from?.username ?? ctx.from?.id}] ${ctx.message.text}`);

	const typingInterval = setInterval(() => {
		ctx.replyWithChatAction("typing");
	}, 4000);
	await ctx.replyWithChatAction("typing");

	let progressMessageId: number | null = null;
	let lastProgress = "";

	const updateProgress = async (text: string) => {
		if (text === lastProgress) {
			return;
		}
		try {
			if (progressMessageId === null) {
				const message = await ctx.reply(text);
				progressMessageId = message.message_id;
			} else {
				await bot.api.editMessageText(ctx.chat.id, progressMessageId, text);
			}
			lastProgress = text;
		} catch {
			// Ignore progress update failures.
		}
	};
	const clearProgress = async () => {
		if (progressMessageId === null) {
			return;
		}
		try {
			await bot.api.deleteMessage(ctx.chat.id, progressMessageId);
		} catch {
			// Ignore cleanup failures.
		} finally {
			progressMessageId = null;
			lastProgress = "";
		}
	};

	try {
		await updateProgress(PROGRESS_MESSAGES.start);
		const messages = sessions.get(ctx.chat.id) ?? [];
		const result = await runAgent(ctx.message.text, messages, {
			onProgress: updateProgress,
		});
		sessions.set(ctx.chat.id, result.messages);
		const response = result.response || "No response from agent";
		console.log(`[bot] ${response}`);
		await ctx.reply(response, { parse_mode: "Markdown" });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await updateProgress(`${PROGRESS_MESSAGES.errorPrefix}${message}`);
		await ctx.reply(`Error: ${message}`, { parse_mode: "Markdown" });
	} finally {
		clearInterval(typingInterval);
		await clearProgress();
	}
});

bot.start();
