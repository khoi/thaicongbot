import { anthropic } from "@ai-sdk/anthropic";
import { type ModelMessage, ToolLoopAgent, tool } from "ai";
import { z } from "zod";

export interface AgentResult {
	response: string;
	messages: ModelMessage[];
}

export interface AgentOptions {
	onProgress?: ProgressFn;
}

type ProgressFn = (text: string) => Promise<void> | void;

const SYSTEM_PROMPT = `Bạn là Thái Công, một người giàu có và trịch thượng. Nhiệm vụ của bạn là quản lý kho phim ảnh và series theo yêu cầu của user.

PHONG CÁCH:
- Xưng "Thái Công" ngôi thứ ba, giọng ban ơn và trịch thượng.
- Gọi người dùng là bạn.
- Hãy đưa ra những lời bông đùa, chế giễu user theo phong cách trịch thượng, khinh người.

QUY TẮC:
- Gọi kho phim ảnh và series là "bộ sưu tập của Thái Công"

# Output Format

- Trả lời ngắn gọn, tối đa 2-3 câu.
- Khi đưa ra 1 danh sách, luôn đánh số thứ tự để user dễ dàng chọn. (đánh số từ 1 - 10, phim và series chung số)
`;

export const PROGRESS_MESSAGES = {
	start: "Thái Công đang xử lý...",
	done: "Xong. Gu tinh tế.",
	errorPrefix: "Thái Công gặp lỗi: ",
	radarrSearch: (query: string) =>
		`Thái Công đang lục kho tàng phim cho "${query}"...`,
	radarrAdd: (tmdbId: number) =>
		`Thái Công đang thêm phim (TMDB ${tmdbId}) vào kho tàng phim...`,
	sonarrSearch: (query: string) =>
		`Thái Công đang lục kho tàng series cho "${query}"...`,
	sonarrAdd: (title: string) =>
		`Thái Công đang thêm series: "${title}" vào kho tàng series...`,
};

function createAgent(onProgress?: ProgressFn) {
	return new ToolLoopAgent({
		model: anthropic("claude-sonnet-4-5"),
		instructions: SYSTEM_PROMPT,
		tools: buildTools(onProgress),
	});
}

function buildTools(onProgress?: ProgressFn) {
	return {
		radarr_search: tool({
			description:
				"Search Radarr for movies by title (accepts a movie title, not a generic keyword).",
			inputSchema: z.object({
				query: z.string().min(1),
			}),
			execute: async ({ query }) => {
				await reportProgress(onProgress, PROGRESS_MESSAGES.radarrSearch(query));
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
				await reportProgress(onProgress, PROGRESS_MESSAGES.radarrAdd(tmdbId));
				const resolvedQualityProfileId =
					qualityProfileId ??
					(await pickQualityProfileIdByName("Any", () =>
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
			description:
				"Search Sonarr for TV series by title (accepts a series title, not a generic keyword).",
			inputSchema: z.object({
				query: z.string().min(1),
			}),
			execute: async ({ query }) => {
				await reportProgress(onProgress, PROGRESS_MESSAGES.sonarrSearch(query));
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
				await reportProgress(onProgress, PROGRESS_MESSAGES.sonarrAdd(title));
				const resolvedQualityProfileId =
					qualityProfileId ??
					(await pickQualityProfileIdByName("Any", () =>
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
	};
}

export async function runAgent(
	userPrompt: string,
	messages: ModelMessage[] = [],
	options: AgentOptions = {},
): Promise<AgentResult> {
	const nextMessages: ModelMessage[] = [
		...messages,
		{ role: "user", content: userPrompt },
	];
	const agent = createAgent(options.onProgress);
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

async function reportProgress(
	onProgress: ProgressFn | undefined,
	text: string,
): Promise<void> {
	if (!onProgress) {
		return;
	}
	try {
		await onProgress(text);
	} catch {
		// Ignore progress errors to avoid breaking tool execution.
	}
}

async function pickQualityProfileIdByName(
	name: string,
	fetcher: () => Promise<unknown>,
): Promise<number> {
	const data = await fetcher();
	if (!Array.isArray(data) || data.length === 0) {
		throw new Error("No quality profiles available");
	}
	const match = (data as { id?: number; name?: string }[]).find(
		(entry) => entry.name?.toLowerCase() === name.toLowerCase(),
	);
	if (!match || typeof match.id !== "number") {
		throw new Error(`Quality profile "${name}" not found`);
	}
	return match.id;
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
