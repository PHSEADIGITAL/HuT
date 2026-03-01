import { NativeModules, Platform } from "react-native";

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

function fallbackApiBaseUrl() {
  if (detectedExpoDevHost) {
    return `http://${detectedExpoDevHost}:3000`;
  }
  if (Platform.OS === "android") {
    // Android emulator loopback for local machine backend.
    return "http://10.0.2.2:3000";
  }
  return "http://localhost:3000";
}

export const API_BASE_URL = explicitBaseUrl || fallbackApiBaseUrl();
export const API_BASE_URL_SOURCE = explicitBaseUrl
  ? "env"
  : detectedExpoDevHost
    ? "expo-host"
    : "platform-fallback";
