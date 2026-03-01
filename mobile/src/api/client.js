import { API_BASE_URL } from "../config";

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body)
  });

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
