import { API_BASE_URL, API_BASE_URL_SOURCE } from "../config";

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

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body)
    });
  } catch (_error) {
    const message = [
      "Network error while contacting the HuT API.",
      `Base URL: ${API_BASE_URL} (${API_BASE_URL_SOURCE}).`,
      "Ensure backend is running and your phone can access this address.",
      "If needed, set EXPO_PUBLIC_API_BASE_URL to your machine LAN IP (for example: http://192.168.1.10:3000)."
    ].join(" ");
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
