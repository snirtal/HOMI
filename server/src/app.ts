import { createApp } from "./http.js";
import { createRuntimeService } from "./runtime.js";

export const app = createApp(createRuntimeService());
