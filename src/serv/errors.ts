const DEMO = "Review again in demo mode if you want a verdict without calling SERV.";

export type ServFailure = {
  status: number;
  message: string;
};

/** Turn a live SERV failure into a short message. The raw provider body is not shown. */
export function explainServFailure(error: unknown): ServFailure {
  if (isTimeout(error)) {
    return { status: 504, message: `SERV took too long to answer. Nothing was signed. ${DEMO}` };
  }
  const status = readStatus(error);
  if (status === 401 || status === 403) {
    return { status: 401, message: `SERV rejected the API key. Check the key on the server. ${DEMO}` };
  }
  if (status === 429) {
    return { status: 429, message: `SERV is limiting requests right now. Wait a moment. ${DEMO}` };
  }
  if (status !== null && status >= 500 && status <= 599) {
    return { status: 502, message: `SERV had a server error. Nothing was signed. ${DEMO}` };
  }
  if (error instanceof Error && /empty verdict|did not return JSON|returned a non-object/i.test(error.message)) {
    return {
      status: 502,
      message: `SERV's answer was empty or not JSON, including after a retry. Nothing was signed. ${DEMO}`,
    };
  }
  return { status: 502, message: `SERV did not return a verdict. Nothing was signed. ${DEMO}` };
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "TimeoutError" || name === "APIConnectionTimeoutError" || name === "AbortError") return true;
  const message = error instanceof Error ? error.message : "";
  return /timeout|timed out|aborted due to timeout/i.test(message);
}
