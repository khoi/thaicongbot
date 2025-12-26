import { ToolLoopAgent, tool, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export interface AgentResult {
	response: string;
	messages: ModelMessage[];
}

const SYSTEM_PROMPT = `Nhập vai Thái Công - "ông hoàng xa xỉ", CHẢNH tối đa, trả lời CỰC NGẮN.

PHONG CÁCH:
- Xưng "Thái Công" ngôi 3, giọng ban ơn
- Từ vựng: đẳng cấp, tinh tế, kịch cỡm, quê

Các câu nói phổ biến của Thái Công, dùng khi phù hợp, có thể chế cháo nếu cần thiết 
- "Kiến thức, kinh nghiệm, trải nghiệm"
- "Rối mắt thì bịt mắt lại!"
- "Kịch cỡm lắm" / "Hơi quê"
- "Gu tinh tế đấy"
- "Không ai mua được sự lịch thiệp"
- "Toilet còn cạnh bồn tắm thì làm sao hiểu phong cách sống"

QUY TẮC:
- TRẢ LỜI TỐI ĐA 2-3 CÂU
- Tối đa 5 items, đánh số 1,2,3...
- Nhận prompt = TÌM NGAY
- Gọi là "bộ sưu tập của Thái Công"

Tìm kiếm: LUÔN chạy SONG SONG radarr_search + sonarr_search.`;

const agent = new ToolLoopAgent({
	model: anthropic("claude-sonnet-4-5"),
	instructions: SYSTEM_PROMPT,
	tools: {
		radarr_search: tool({
			description: "Search Radarr for movies by title.",
			inputSchema: z.object({
				query: z.string().min(1),
			}),
			execute: async ({ query }) => {
				const data = await radarrGet(
					`/api/v3/movie/lookup?term=${encodeURIComponent(query)}`,
				);
				return (Array.isArray(data) ? data : []).map((item) => ({
					title: item.title,
					year: item.year,
					tmdbId: item.tmdbId,
					overview: item.overview?.slice(0, 120) ?? "",
				}));
			},
		}),
		radarr_quality_profiles: tool({
			description: "List Radarr quality profiles.",
			inputSchema: z.object({}),
			execute: async () => {
				const data = await radarrGet("/api/v3/qualityprofile");
				return (Array.isArray(data) ? data : []).map((item) => ({
					id: item.id,
					name: item.name,
				}));
			},
		}),
		radarr_root_folders: tool({
			description: "List Radarr root folders.",
			inputSchema: z.object({}),
			execute: async () => {
				const data = await radarrGet("/api/v3/rootfolder");
				return (Array.isArray(data) ? data : []).map((item) => ({
					id: item.id,
					path: item.path,
				}));
			},
		}),
		radarr_add_movie: tool({
			description: "Add a movie to Radarr by TMDB id.",
			inputSchema: z.object({
				tmdbId: z.number().int(),
				qualityProfileId: z.number().int().optional(),
				rootFolderPath: z.string().min(1).optional(),
				monitored: z.boolean().optional(),
				searchForMovie: z.boolean().optional(),
			}),
			execute: async ({
				tmdbId,
				qualityProfileId,
				rootFolderPath,
				monitored = true,
				searchForMovie = true,
			}) => {
				const resolvedQualityProfileId =
					qualityProfileId ??
					(await pickFirstQualityProfileId(() =>
						radarrGet("/api/v3/qualityprofile"),
					));
				const resolvedRootFolderPath =
					rootFolderPath ??
					(await pickFirstRootFolderPath(() =>
						radarrGet("/api/v3/rootfolder"),
					));

				return radarrPost("/api/v3/movie", {
					tmdbId,
					qualityProfileId: resolvedQualityProfileId,
					rootFolderPath: resolvedRootFolderPath,
					monitored,
					addOptions: {
						searchForMovie,
					},
				});
			},
		}),
		sonarr_search: tool({
			description: "Search Sonarr for TV series by title.",
			inputSchema: z.object({
				query: z.string().min(1),
			}),
			execute: async ({ query }) => {
				const data = await sonarrGet(
					`/api/v3/series/lookup?term=${encodeURIComponent(query)}`,
				);
				return (Array.isArray(data) ? data : []).map((item) => ({
					title: item.title,
					year: item.year,
					tvdbId: item.tvdbId,
					overview: item.overview?.slice(0, 120) ?? "",
				}));
			},
		}),
		sonarr_quality_profiles: tool({
			description: "List Sonarr quality profiles.",
			inputSchema: z.object({}),
			execute: async () => {
				const data = await sonarrGet("/api/v3/qualityprofile");
				return (Array.isArray(data) ? data : []).map((item) => ({
					id: item.id,
					name: item.name,
				}));
			},
		}),
		sonarr_root_folders: tool({
			description: "List Sonarr root folders.",
			inputSchema: z.object({}),
			execute: async () => {
				const data = await sonarrGet("/api/v3/rootfolder");
				return (Array.isArray(data) ? data : []).map((item) => ({
					id: item.id,
					path: item.path,
				}));
			},
		}),
		sonarr_add_series: tool({
			description: "Add a TV series to Sonarr by TVDB id.",
			inputSchema: z.object({
				tvdbId: z.number().int(),
				title: z.string().min(1),
				qualityProfileId: z.number().int().optional(),
				rootFolderPath: z.string().min(1).optional(),
				monitored: z.boolean().optional(),
				seasonFolder: z.boolean().optional(),
				searchForMissingEpisodes: z.boolean().optional(),
			}),
			execute: async ({
				tvdbId,
				title,
				qualityProfileId,
				rootFolderPath,
				monitored = true,
				seasonFolder = true,
				searchForMissingEpisodes = true,
			}) => {
				const resolvedQualityProfileId =
					qualityProfileId ??
					(await pickFirstQualityProfileId(() =>
						sonarrGet("/api/v3/qualityprofile"),
					));
				const resolvedRootFolderPath =
					rootFolderPath ??
					(await pickFirstRootFolderPath(() =>
						sonarrGet("/api/v3/rootfolder"),
					));

				return sonarrPost("/api/v3/series", {
					tvdbId,
					title,
					qualityProfileId: resolvedQualityProfileId,
					rootFolderPath: resolvedRootFolderPath,
					monitored,
					seasonFolder,
					addOptions: {
						searchForMissingEpisodes,
					},
				});
			},
		}),
	},
});

export async function runAgent(
	userPrompt: string,
	messages: ModelMessage[] = [],
): Promise<AgentResult> {
	const nextMessages: ModelMessage[] = [
		...messages,
		{ role: "user", content: userPrompt },
	];
	const result = await agent.generate({ messages: nextMessages });
	const response = result.text;
	const updatedMessages: ModelMessage[] = [
		...nextMessages,
		{ role: "assistant", content: response },
	];
	return { response, messages: updatedMessages };
}

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is not set`);
	}
	return value;
}

function resolveUrl(base: string, path: string): string {
	const trimmed = base.replace(/\/+$/, "");
	return `${trimmed}${path}`;
}

async function requestJson(
	url: string,
	options: RequestInit,
): Promise<unknown> {
	const response = await fetch(url, options);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`${response.status} ${response.statusText} from ${url}: ${text.slice(0, 200)}`,
		);
	}
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function radarrGet(path: string): Promise<unknown> {
	const baseUrl = getEnv("RADARR_URL");
	const apiKey = getEnv("RADARR_API_KEY");
	return requestJson(resolveUrl(baseUrl, path), {
		method: "GET",
		headers: {
			"X-Api-Key": apiKey,
		},
	});
}

async function radarrPost(path: string, body: unknown): Promise<unknown> {
	const baseUrl = getEnv("RADARR_URL");
	const apiKey = getEnv("RADARR_API_KEY");
	return requestJson(resolveUrl(baseUrl, path), {
		method: "POST",
		headers: {
			"X-Api-Key": apiKey,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

async function sonarrGet(path: string): Promise<unknown> {
	const baseUrl = getEnv("SONARR_URL");
	const apiKey = getEnv("SONARR_API_KEY");
	return requestJson(resolveUrl(baseUrl, path), {
		method: "GET",
		headers: {
			"X-Api-Key": apiKey,
		},
	});
}

async function sonarrPost(path: string, body: unknown): Promise<unknown> {
	const baseUrl = getEnv("SONARR_URL");
	const apiKey = getEnv("SONARR_API_KEY");
	return requestJson(resolveUrl(baseUrl, path), {
		method: "POST",
		headers: {
			"X-Api-Key": apiKey,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

async function pickFirstQualityProfileId(
	fetcher: () => Promise<unknown>,
): Promise<number> {
	const data = await fetcher();
	if (!Array.isArray(data) || data.length === 0) {
		throw new Error("No quality profiles available");
	}
	const first = data[0] as { id?: number };
	if (typeof first.id !== "number") {
		throw new Error("Quality profile id missing");
	}
	return first.id;
}

async function pickFirstRootFolderPath(
	fetcher: () => Promise<unknown>,
): Promise<string> {
	const data = await fetcher();
	if (!Array.isArray(data) || data.length === 0) {
		throw new Error("No root folders available");
	}
	const accessible = (data as { path?: string; accessible?: boolean }[]).find(
		(entry) => entry.accessible,
	);
	const target = accessible ?? (data[0] as { path?: string });
	if (typeof target.path !== "string" || target.path.length === 0) {
		throw new Error("Root folder path missing");
	}
	return target.path;
}
