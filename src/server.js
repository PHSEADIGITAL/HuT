require("dotenv").config();

const os = require("os");

const { appName, host, port } = require("./config");
const { createApp } = require("./app");

const app = createApp();

function listLanUrls(activePort) {
  const interfaces = os.networkInterfaces();
  const urls = new Set();
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      const family = typeof entry.family === "string" ? entry.family : entry.family === 4 ? "IPv4" : "";
      if (family !== "IPv4" || entry.internal) {
        return;
      }
      urls.add(`http://${entry.address}:${activePort}`);
    });
  });
  return Array.from(urls);
}

app.listen(port, host, () => {
  console.log(`${appName} running on http://localhost:${port}`);
  if (host === "0.0.0.0" || host === "::") {
    const lanUrls = listLanUrls(port);
    if (lanUrls.length) {
      console.log(`LAN access: ${lanUrls.join(", ")}`);
    }
  } else if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    console.log(`Host access: http://${host}:${port}`);
  }
});
