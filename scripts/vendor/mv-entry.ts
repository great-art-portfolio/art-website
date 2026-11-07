/** Vendor bundle entry for /js/model-viewer.js: registers <model-viewer>
 * and exposes the wall AR viewer as window.WallAr, sharing one three.js. */
import "@google/model-viewer/dist/model-viewer-module.min.js";
import { start, supported } from "../../src/lib/wall-ar";

window.WallAr = { start, supported };
