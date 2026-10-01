import { register } from "node:module";

// Registers the extensionless-import resolver (see extension-loader.mjs)
// for unit tests. Loaded by the test:unit script.
register("./extension-loader.mjs", import.meta.url);
