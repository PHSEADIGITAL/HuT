import { NativeModules, Platform } from "react-native";

const LOCAL_ONLY_HOSTS = new Set(["localhost", "127.0.0.1", "127.0.1.1", "::1", "0.0.0.0", "10.0.2.2", "10.0.3.2"]);

function addCandidate(candidates, value, source) {
  const url = normalizeBaseUrl(value);
  if (!url) {
    return;
  }
  if (candidates.some((candidate) => candidate.url === url)) {
    return;
  }
  candidates.push({ url, source });
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function extractHostFromDevUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl || !/^(https?|exp|exps):\/\//i.test(rawUrl)) {
    return "";
  }
  const withoutProtocol = rawUrl.split("://")[1] || "";
  const hostWithPort = withoutProtocol.split("/")[0] || "";
  const host = hostWithPort.split(":")[0] || "";
  return host.trim();
}

function parseHttpUrlParts(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return null;
  }
  const protocol = rawUrl.toLowerCase().startsWith("https://") ? "https" : "http";
  const withoutProtocol = rawUrl.split("://")[1] || "";
  const hostWithPort = withoutProtocol.split("/")[0] || "";
  if (!hostWithPort) {
    return null;
  }
  const [hostRaw, portRaw] = hostWithPort.split(":");
  const host = String(hostRaw || "").trim().toLowerCase();
  const port = String(portRaw || "").trim();
  return {
    protocol,
    host,
    port: /^\d+$/.test(port) ? port : ""
  };
}

function detectExpoDevHost() {
  const bundleUrlCandidates = [
    NativeModules?.SourceCode?.scriptURL,
    globalThis?.location?.href
  ];
  for (const candidate of bundleUrlCandidates) {
    const host = extractHostFromDevUrl(candidate);
    if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") {
      continue;
    }
    return host;
  }
  return "";
}

const explicitBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
const detectedExpoDevHost = detectExpoDevHost();
const explicitParts = parseHttpUrlParts(explicitBaseUrl);
const rewrittenExplicitBaseUrl =
  explicitBaseUrl &&
  explicitParts &&
  detectedExpoDevHost &&
  LOCAL_ONLY_HOSTS.has(explicitParts.host)
    ? `${explicitParts.protocol}://${detectedExpoDevHost}:${explicitParts.port || "3000"}`
    : "";

const apiBaseCandidates = [];
addCandidate(apiBaseCandidates, explicitBaseUrl, "env");
addCandidate(apiBaseCandidates, rewrittenExplicitBaseUrl, "env-localhost-rewritten");
if (detectedExpoDevHost) {
  addCandidate(apiBaseCandidates, `http://${detectedExpoDevHost}:3000`, "expo-host");
}
if (Platform.OS === "android") {
  // Android emulators commonly map host machine via 10.0.2.2 / 10.0.3.2.
  addCandidate(apiBaseCandidates, "http://10.0.2.2:3000", "android-emulator");
  addCandidate(apiBaseCandidates, "http://10.0.3.2:3000", "android-alt-emulator");
}
addCandidate(apiBaseCandidates, "http://localhost:3000", "localhost");

if (!apiBaseCandidates.length) {
  addCandidate(apiBaseCandidates, "http://localhost:3000", "default-localhost");
}

export const API_BASE_URL_CANDIDATES = apiBaseCandidates;
export const API_BASE_URL = apiBaseCandidates[0].url;
export const API_BASE_URL_SOURCE = apiBaseCandidates[0].source;
