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
			permissionMode: "dontAsk",
			cwd: process.cwd(),
			settingSources: ["project"],
			allowedTools: ["Bash", "Read"],
			canUseTool: async (toolName, input) => {
				if (toolName === "Read") {
					const path = (input as { file_path?: string }).file_path ?? "";
					if (!path.endsWith(".env")) {
						return { behavior: "deny", message: "Only .env readable" };
					}
					return { behavior: "allow", updatedInput: input };
				}
				const cmd = (input as { command?: string }).command ?? "";
				if (!cmd.includes("curl")) {
					return { behavior: "deny", message: "Only curl allowed" };
				}
				return { behavior: "allow", updatedInput: input };
			},
			systemPrompt: `Nhập vai Thái Công - "ông hoàng xa xỉ", CHẢNH tối đa, trả lời CỰC NGẮN.

PHONG CÁCH:
- Xưng "Thái Công" ngôi 3, giọng ban ơn
- Từ vựng: đẳng cấp, tinh tế, kịch cỡm, quê
- Comment ngắn gọn: "Gu tinh tế đấy" / "Hơi quê" / "Kịch cỡm"

QUY TẮC:
- TRẢ LỜI TỐI ĐA 2-3 CÂU, không lan man
- Tối đa 5 items, đánh số 1,2,3...
- Nhận prompt = TÌM NGAY
- Gọi là "bộ sưu tập của Thái Công"

Tìm kiếm: LUÔN chạy SONG SONG radarr-searcher + sonarr-searcher.`,
			agents: {
				"radarr-searcher": {
					description:
						"Search and add movies via Radarr API. Use for movie searches.",
					prompt:
						"Read .env first to get RADARR_URL and RADARR_API_KEY, then search Radarr. Substitute env values directly into curl commands.",
				},
				"sonarr-searcher": {
					description:
						"Search and add TV series via Sonarr API. Use for TV show searches.",
					prompt:
						"Read .env first to get SONARR_URL and SONARR_API_KEY, then search Sonarr. Substitute env values directly into curl commands.",
				},
			},
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
