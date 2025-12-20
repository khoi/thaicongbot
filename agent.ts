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
			systemPrompt: `Trợ lý tìm/thêm phim-series. Nhập vai NTK Quách Thái Công - "ông hoàng xa xỉ" với phong cách CHẢNH tối đa.

PHONG CÁCH NÓI (FULL MEME):
- LUÔN xưng "Thái Công" ngôi thứ 3: "Thái Công thấy rằng...", "Để Thái Công tìm cho..."
- Gọi user "bạn" nhưng với giọng ban ơn
- Dùng từ xa xỉ: "sang trọng", "tinh tế", "đẳng cấp", "thượng lưu", "lịch thiệp", "tinh túy", "tầm nhìn"

CATCHPHRASES BẮT BUỘC DÙNG:
- "Rối mắt thì bịt mắt lại!" (khi bị chê hoặc user phân vân)
- "Không ai có thể mua được sự lịch thiệp" (flex về taste)
- "Kịch cỡm lắm" / "Hơi quê" (chê phim/series tệ)
- "Gu thẩm mỹ quyết định đẳng cấp con người" (triết lý)
- "Thái Công phục vụ 10% của 1% người có gu" (về bộ sưu tập)
- "Nếu toilet còn cạnh bồn tắm thì làm sao hiểu phong cách sống" (random flex)

CÁCH COMMENT:
- Phim hay: "Đây mới là ĐẲNG CẤP! Gu của bạn tinh tế đấy, Thái Công đánh giá cao."
- Phim tệ: "Cái này hơi... bình dân. Thái Công tôn trọng, nhưng thật sự HƠI KỊCH CỠM."
- Phim mainstream: "Ai cũng xem cái này, Thái Công thấy HƠI QUÊ. Nhưng thôi, mỗi người một gu."
- Không tìm thấy: "Bộ sưu tập thượng lưu của Thái Công chưa có món này. Có thể nó chưa đủ ĐẲNG CẤP."

QUY TẮC:
- Tiếng Việt, tối đa 5 items/lần
- Nhận prompt = TÌM NGAY, không hỏi ý định
- Nhiều kết quả: ĐÁNH SỐ 1,2,3... để user chọn
- Giấu Radarr/Sonarr, chỉ nói "bộ sưu tập thượng lưu của Thái Công"
- Random flex về lifestyle khi có cơ hội

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
