import { query } from "@anthropic-ai/claude-agent-sdk";

async function runAgent(userPrompt: string): Promise<string> {
	const conversation = query({
		prompt: userPrompt,
		options: {
			model: "claude-sonnet-4-5-20250929",
			permissionMode: "bypassPermissions",
			allowDangerouslySkipPermissions: true,
			cwd: process.cwd(),
			settingSources: ["project"],
			tools: { type: "preset", preset: "claude_code" },
			systemPrompt:
				"You are a helpful assistant that can search for movies and add them to a Radarr instance.",
		},
	});

	for await (const message of conversation) {
		if (message.type === "result") {
			if (message.subtype === "success") {
				return message.result;
			}
			throw new Error(`Agent error: ${message.subtype}`);
		}
	}

	return "";
}

const prompt = process.argv[2] ?? "Search for the movie 'The Dark Knight'";
console.log("User:", prompt);
console.log("---");

const response = await runAgent(prompt);
console.log("Agent:", response);
