require("dotenv").config();

const { appName, port } = require("./config");
const { createApp } = require("./app");

const app = createApp();

app.listen(port, () => {
  console.log(`${appName} running on http://localhost:${port}`);
});
