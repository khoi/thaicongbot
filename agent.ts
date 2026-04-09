import { anthropic } from "@ai-sdk/anthropic";
import { type ModelMessage, ToolLoopAgent, tool } from "ai";
import { z } from "zod";

export interface AgentResult {
	response: string;
	messages: ModelMessage[];
}

export interface AgentUserContext {
	id?: number;
	firstName?: string;
	lastName?: string;
	username?: string;
	displayName?: string;
}

export interface AgentOptions {
	onProgress?: ProgressFn;
	user?: AgentUserContext;
}

type ProgressFn = (text: string) => Promise<void> | void;
type LookupRecord = Record<string, unknown>;

const BASE_SYSTEM_PROMPT = `You are Thái Công, a wealthy and arrogant curator who manages a film and series library at the user's request.

<role>
- Persona: Thái Công (third-person self-reference).
- Language: Vietnamese.
- Tone: condescending, indulgent, lightly mocking.
</role>

<context>
- The library is called "bộ sưu tập của Thái Công".
</context>

<objectives>
- Help the user find, choose, and add movies/series in the library.
- Use available tools for search/add actions; do not invent titles, IDs, or tool results.
</objectives>

<style>
- Address the user as "bạn" by default.
</style>

<response_rules>
- Always respond in Vietnamese.
- Keep replies to 2–3 sentences.
- If you provide a list, always number items 1–10 so the user can choose. Movies and series share the same numbering.
- If the request is ambiguous or missing key details (e.g., title or movie vs. series), ask one short clarifying question instead of guessing.
- If you cannot complete a request, say so briefly and ask for the missing detail.
</response_rules>
`;

function buildSystemPrompt(user?: AgentUserContext) {
	const fallbackName = [user?.firstName, user?.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();
	const name = user?.displayName || fallbackName || user?.username;
	if (!name) {
		return BASE_SYSTEM_PROMPT;
	}
	return `${BASE_SYSTEM_PROMPT}

<user>
- display_name: ${name}
${user?.username ? `- username: ${user.username}` : ""}
</user>

<additional_rules>
- If a display name or username is provided, address the user by that name instead of "bạn".
- If a provided name lacks diacritics, infer the most likely Vietnamese diacritics (e.g., khoi → Khôi, thuan → Thuận).
- If you're unsure how to address them, ask their preferred form.
</additional_rules>
`;
}

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

function createAgent(onProgress?: ProgressFn, user?: AgentUserContext) {
	return new ToolLoopAgent({
		model: anthropic("claude-sonnet-4-5"),
		instructions: buildSystemPrompt(user),
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
					alreadyAdded: isRadarrMovieInLibrary(item),
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
				const movie = await radarrLookupMovieByTmdbId(tmdbId);
				if (isRadarrMovieInLibrary(movie)) {
					throw new Error(
						`${getLookupTitle(movie, `Movie ${tmdbId}`)} is already in Radarr`,
					);
				}
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
					...movie,
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
					alreadyAdded: isSonarrSeriesInLibrary(item),
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
				const series = await sonarrLookupSeriesByTvdbId(tvdbId);
				if (isSonarrSeriesInLibrary(series)) {
					throw new Error(
						`${getLookupTitle(series, title)} is already in Sonarr`,
					);
				}
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
				const languageProfileId = await pickOptionalFirstId(() =>
					sonarrGet("/api/v3/languageprofile"),
				);

				return sonarrPost("/api/v3/series", {
					...series,
					qualityProfileId: resolvedQualityProfileId,
					rootFolderPath: resolvedRootFolderPath,
					monitored,
					seasonFolder,
					addOptions: {
						monitor: "all",
						searchForMissingEpisodes,
						searchForCutoffUnmetEpisodes: false,
					},
					...(typeof languageProfileId === "number"
						? { languageProfileId }
						: {}),
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
	const agent = createAgent(options.onProgress, options.user);
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
	if (match && typeof match.id === "number") {
		return match.id;
	}
	const fallback = data[0] as { id?: number };
	if (typeof fallback.id !== "number") {
		throw new Error("Quality profile id missing");
	}
	return fallback.id;
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

async function pickOptionalFirstId(
	fetcher: () => Promise<unknown>,
): Promise<number | undefined> {
	try {
		const data = await fetcher();
		if (!Array.isArray(data) || data.length === 0) {
			return undefined;
		}
		const target = data[0] as { id?: number };
		return typeof target.id === "number" ? target.id : undefined;
	} catch {
		return undefined;
	}
}

async function radarrLookupMovieByTmdbId(
	tmdbId: number,
): Promise<LookupRecord> {
	return asLookupRecord(
		await radarrGet(`/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`),
		`Movie ${tmdbId}`,
	);
}

async function sonarrLookupSeriesByTvdbId(
	tvdbId: number,
): Promise<LookupRecord> {
	const data = await sonarrGet(
		`/api/v3/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`,
	);
	if (!Array.isArray(data) || data.length === 0) {
		throw new Error(`Series ${tvdbId} not found`);
	}
	const match =
		data.find(
			(entry) =>
				entry &&
				typeof entry === "object" &&
				"tvdbId" in entry &&
				entry.tvdbId === tvdbId,
		) ?? data[0];
	return asLookupRecord(match, `Series ${tvdbId}`);
}

function asLookupRecord(value: unknown, label: string): LookupRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} lookup failed`);
	}
	return value as LookupRecord;
}

function getLookupNumber(
	resource: LookupRecord,
	key: string,
): number | undefined {
	const value = resource[key];
	return typeof value === "number" ? value : undefined;
}

function getLookupTitle(resource: LookupRecord, fallback: string): string {
	const value = resource.title;
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

function hasAddedTimestamp(value: unknown): boolean {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value !== "0001-01-01T00:00:00Z"
	);
}

function isRadarrMovieInLibrary(movie: LookupRecord): boolean {
	return (
		hasAddedTimestamp(movie.added) ||
		(getLookupNumber(movie, "id") ?? 0) > 0 ||
		(getLookupNumber(movie, "movieFileId") ?? 0) > 0
	);
}

function isSonarrSeriesInLibrary(series: LookupRecord): boolean {
	return (
		hasAddedTimestamp(series.added) || (getLookupNumber(series, "id") ?? 0) > 0
	);
}
