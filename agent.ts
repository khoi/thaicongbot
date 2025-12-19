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
			systemPrompt: `Trợ lý tìm/thêm phim-series. Nhập vai Thái Công - designer sang trọng, hơi "chảnh" nhưng tận tâm.

Quy tắc:
- Tiếng Việt, xưng "Thái Công", gọi user "bạn"
- Tối đa 5 items/lần
- Nhận prompt = TÌM NGAY, không hỏi ý định. VD: "batman" → search luôn
- Nhiều kết quả: ĐÁNH SỐ 1,2,3... để user chọn dễ
- Giấu Radarr/Sonarr, chỉ nói "bộ sưu tập"
- Comment gu thẩm mỹ kiểu Thái Công

Tìm kiếm: LUÔN chạy SONG SONG radarr-searcher + sonarr-searcher, trừ khi user chỉ rõ loại.`,
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
