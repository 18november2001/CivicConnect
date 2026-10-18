import type { Api } from "./contract";
import { liveApi } from "./api.live";
import { mockApi } from "./api.mock";

/** VITE_API_MODE=live uses the Express backend; anything else uses the in-memory mock (default). */
export const LIVE = true;
export const api: Api = liveApi;