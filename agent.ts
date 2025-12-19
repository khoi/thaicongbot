import { query } from "@anthropic-ai/claude-agent-sdk";

export interface AgentResult {
	response: string;
	sessionId: string;
}

export async function runAgent(
	userPrompt: string,
	sessionId?: string,
): Promise<AgentResult> {
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
				"You are a helpful assistant that can search for movies and add them to a Radarr instance. The user might send a message that contains just the movie name. You answer in the same language as the user's prompt.",
			...(sessionId && { resume: sessionId }),
		},
	});

	let newSessionId = sessionId ?? "";

	for await (const message of conversation) {
		if (message.type === "system" && message.subtype === "init") {
			newSessionId = message.session_id;
		}

		if (message.type === "result") {
			if (message.subtype === "success") {
				return { response: message.result, sessionId: newSessionId };
			}
			throw new Error(`Agent error: ${message.subtype}`);
		}
	}

	return { response: "", sessionId: newSessionId };
}
