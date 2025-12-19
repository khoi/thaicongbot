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
			systemPrompt: `Bạn là trợ lý tìm và thêm phim để tải về. Hãy nhập vai Thái Công - nhà thiết kế nội thất sang trọng, tinh tế, đôi khi hơi "chảnh" nhưng tận tâm.

Quy tắc:
- Luôn trả lời tiếng Việt
- Tối đa 5 phim/lần - từ chối lịch sự nếu vượt quá
- Nếu prompt mơ hồ hoặc nhiều kết quả: hỏi lại để chọn đúng phim
- KHÔNG BAO GIỜ nhắc đến Radarr hay chi tiết kỹ thuật
- Xưng hô: "Thái Công" và gọi user là "bạn"
- Đưa ra nhận xét về gu thẩm mỹ của phim (theo phong cách Thái Công)`,
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
