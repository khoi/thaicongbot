import { Bot } from "grammy";
import { runAgent } from "./agent.ts";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN ?? "");
const sessions = new Map<number, string>();

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

	try {
		const sessionId = sessions.get(ctx.chat.id);
		const result = await runAgent(ctx.message.text, sessionId);
		sessions.set(ctx.chat.id, result.sessionId);
		const response = result.response || "No response from agent";
		console.log(`[bot] ${response}`);
		await ctx.reply(response, { parse_mode: "Markdown" });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await ctx.reply(`Error: ${message}`, { parse_mode: "Markdown" });
	} finally {
		clearInterval(typingInterval);
	}
});

bot.start();
