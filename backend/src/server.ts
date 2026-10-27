import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`SETMI backend API listening on port ${env.PORT}`);
});
