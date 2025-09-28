import type { Goal, GoalBook, GoalStatus, RecommendationResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;
const LONG_RUNNING_TIMEOUT_MS = 45_000;

let warnedMixedContent = false;
let warnedLocalhostInProduction = false;

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError") {
    return true;
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return false;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        "バックエンドからの応答がタイムアウトしました。API の URL やネットワーク設定を確認してください。",
        { cause: error instanceof Error ? error : undefined }
      );
    }
    if (error instanceof TypeError) {
      throw new Error("バックエンドに接続できませんでした。環境変数やネットワーク設定を確認してください。", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveApiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE?.trim() ?? process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    if (
      process.env.NODE_ENV === "production" &&
      /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/i.test(configured) &&
      !warnedLocalhostInProduction
    ) {
      warnedLocalhostInProduction = true;
      console.warn(
        "NEXT_PUBLIC_API_BASE(_URL) points to localhost in production. Remove the variable to use the built-in proxy or update it to the deployed FastAPI endpoint."
      );
    }

    if (configured.startsWith("http://") && typeof window !== "undefined" && window.location.protocol === "https:") {
      if (!warnedMixedContent) {
        warnedMixedContent = true;
        console.warn(
          "NEXT_PUBLIC_API_BASE(_URL) uses http:// while the site runs over HTTPS. Falling back to /api/backend to avoid mixed content."
        );
      }
      return "/api/backend";
    }
    return configured.replace(/\/$/, "");
  }
  return "/api/backend";
}

function withBase(path: string): string {
  const base = resolveApiBaseUrl();
  if (base.endsWith("/") && path.startsWith("/")) {
    return `${base}${path.slice(1)}`;
  }
  if (!base.endsWith("/") && !path.startsWith("/")) {
    return `${base}/${path}`;
  }
  return `${base}${path}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const data = await response.json();
      detail = data.detail;
    } catch (error) {
      detail = undefined;
    }
    const message = detail ? `${response.status}: ${detail}` : `${response.statusText}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function registerUser(payload: {
  email: string;
  password: string;
  full_name?: string;
}): Promise<void> {
  const response = await fetchWithTimeout(withBase("/users"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok && response.status !== 409) {
    await handleResponse(response);
  }
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<string> {
  const body = new URLSearchParams();
  body.append("grant_type", "password");
  body.append("username", payload.email);
  body.append("password", payload.password);

  const response = await fetchWithTimeout(withBase("/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await handleResponse<{ access_token: string }>(response);
  return data.access_token;
}

export async function fetchGoals(token: string): Promise<Goal[]> {
  const response = await fetchWithTimeout(withBase("/goals"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return handleResponse<Goal[]>(response);
}

export async function createGoal(
  token: string,
  payload: { title: string; description?: string }
): Promise<Goal> {
  const response = await fetchWithTimeout(withBase("/goals"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<Goal>(response);
}

export async function requestRecommendations(
  payload: {
    goal_title: string;
    goal_description?: string;
    intent?: string;
    deadline_days?: number;
    preferred_media?: string;
    city_system_ids?: string[];
    limit?: number;
  },
  token?: string
): Promise<RecommendationResponse> {
  const response = await fetchWithTimeout(withBase("/recommendations"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  }, LONG_RUNNING_TIMEOUT_MS);
  return handleResponse<RecommendationResponse>(response);
}

export async function updateGoalBookStatus(
  token: string,
  goalId: number,
  goalBookId: number,
  status: GoalStatus
): Promise<GoalBook> {
  const response = await fetchWithTimeout(
    withBase(`/goals/${goalId}/books/${goalBookId}/status`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    }
  );
  return handleResponse<GoalBook>(response);
}
