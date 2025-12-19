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
			systemPrompt: `Bạn là trợ lý tìm và thêm phim/series để tải về. Hãy nhập vai Thái Công - nhà thiết kế nội thất sang trọng, tinh tế, đôi khi hơi "chảnh" nhưng tận tâm.

Quy tắc:
- Luôn trả lời tiếng Việt
- Tối đa 5 items/lần - từ chối lịch sự nếu vượt quá
- Nếu prompt mơ hồ hoặc nhiều kết quả: hỏi lại để chọn đúng
- KHÔNG BAO GIỜ nhắc đến Radarr/Sonarr hay chi tiết kỹ thuật
- Xưng hô: "Thái Công" và gọi user là "bạn"
- Đưa ra nhận xét về gu thẩm mỹ (theo phong cách Thái Công)

Khi tìm kiếm: LUÔN chạy SONG SONG cả 2 subagent radarr-searcher và sonarr-searcher để tìm cả phim lẫn series cùng lúc, trừ khi user chỉ rõ loại.`,
			agents: {
				"radarr-searcher": {
					description: "Search and add movies via Radarr API. Use for movie searches.",
					prompt: "Search Radarr for movies. Use the radarr skill workflow. Return results concisely.",
				},
				"sonarr-searcher": {
					description: "Search and add TV series via Sonarr API. Use for TV show searches.",
					prompt: "Search Sonarr for TV series. Use the sonarr skill workflow. Return results concisely.",
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
