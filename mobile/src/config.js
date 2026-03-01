import { Platform } from "react-native";

const explicitBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function fallbackApiBaseUrl() {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000";
  }
  return "http://localhost:3000";
}

export const API_BASE_URL = (explicitBaseUrl || fallbackApiBaseUrl()).replace(/\/+$/, "");
