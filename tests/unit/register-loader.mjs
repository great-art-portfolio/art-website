import { register } from "node:module";

// Hooks the extensionless-import resolver (see extension-loader.mjs)
// into every unit test run. Referenced from the test:unit script.
register("./extension-loader.mjs", import.meta.url);
