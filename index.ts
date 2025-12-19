import { runAgent } from "./agent.ts";

const prompt =
	process.argv[2] ?? "Search for movie and shows related to Batman";
console.log("User:", prompt);
console.log("---");

const result = await runAgent(prompt);
console.log("Agent:", result.response);
