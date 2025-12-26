import * as readline from "node:readline";
import { type ModelMessage } from "ai";
import { runAgent } from "./agent.ts";

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

let messages: ModelMessage[] = [];

async function handleInput(prompt: string) {
	if (prompt === "/new") {
		messages = [];
		console.log("Session cleared.");
		return;
	}
	if (prompt === "/exit") {
		rl.close();
		process.exit(0);
	}

	console.log("---");
	const result = await runAgent(prompt, messages);
	messages = result.messages;
	console.log("Agent:", result.response);
}

const initial = process.argv[2];
if (initial) {
	console.log("User:", initial);
	await handleInput(initial);
}

rl.on("line", async (line) => {
	const trimmed = line.trim();
	if (trimmed) {
		console.log("User:", trimmed);
		await handleInput(trimmed);
	}
	rl.prompt();
});

rl.on("close", () => process.exit(0));
rl.prompt();
