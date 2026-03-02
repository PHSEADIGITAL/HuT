import { API_BASE_URL, API_BASE_URL_CANDIDATES, API_BASE_URL_SOURCE } from "../config";

let activeBaseUrl = API_BASE_URL;
let activeBaseSource = API_BASE_URL_SOURCE;

function orderedApiBaseCandidates() {
  const ordered = [{ url: activeBaseUrl, source: activeBaseSource }, ...API_BASE_URL_CANDIDATES];
  const seen = new Set();
  return ordered.filter((candidate) => {
    const key = String(candidate?.url || "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatCandidateList(candidates) {
  return candidates.map((candidate) => `${candidate.url} (${candidate.source})`).join(", ");
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", token = "", body, headers: customHeaders = {} } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = {
    Accept: "application/json",
    ...customHeaders
  };
  if (body !== undefined && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidates = orderedApiBaseCandidates();
  let response = null;
  let networkError = null;

  for (const candidate of candidates) {
    try {
      response = await fetch(`${candidate.url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body)
      });
      activeBaseUrl = candidate.url;
      activeBaseSource = candidate.source;
      networkError = null;
      break;
    } catch (error) {
      networkError = error;
    }
  }

  if (!response) {
    const message = [
      "Network error while contacting the HuT API.",
      `Tried: ${formatCandidateList(candidates)}.`,
      "Ensure backend is running and your device can reach one of the addresses.",
      "Use 10.0.2.2 for Android emulator, localhost for iOS simulator, and LAN IP for physical phones."
    ].join(" ");
    if (networkError?.message) {
      throw new Error(`${message} (${networkError.message})`);
    }
    throw new Error(message);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok === false) {
    const message =
      payload?.error ||
      payload?.message ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
