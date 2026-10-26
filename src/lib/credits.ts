/** The open-source code and fonts the site sends to browsers, with the
 * licence each one asks to travel with it. The Credits page reads the full
 * texts from node_modules at build time, so they match the installed
 * versions. Build-only tools (sharp, esbuild, Vite) aren't listed: they
 * never leave the build. */
export interface Credit {
  name: string;
  url: string;
  /** What it does on this site, in plain words. */
  use: string;
  licence: string;
  /** Direct dependency whose LICENSE file holds the text. */
  pkg?: string;
  /** The text itself, for code bundled without its own LICENSE file. */
  text?: string;
}

const mit = (holder: string): string =>
  [
    "MIT License",
    "",
    `Copyright (c) ${holder}`,
    "",
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:',
    "",
    "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
    "",
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.',
  ].join("\n");

const bsd3 = (holder: string): string =>
  [
    "BSD 3-Clause License",
    "",
    `Copyright (c) ${holder}`,
    "",
    "Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:",
    "",
    "1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.",
    "",
    "2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.",
    "",
    "3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.",
    "",
    'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
  ].join("\n");

export const CREDITS: Credit[] = [
  {
    name: "Fraunces",
    url: "https://github.com/undercasetype/Fraunces",
    use: "The typeface for headings and painting titles.",
    licence: "SIL Open Font License 1.1",
    pkg: "@fontsource-variable/fraunces",
  },
  {
    name: "Caveat",
    url: "https://github.com/googlefonts/caveat",
    use: "The handwriting in the signature and the studio note.",
    licence: "SIL Open Font License 1.1",
    pkg: "@fontsource/caveat",
  },
  {
    name: "three.js",
    url: "https://threejs.org",
    use: "Builds the 3D model behind “See it on your wall”.",
    licence: "MIT",
    pkg: "three",
  },
  {
    name: "<model-viewer>",
    url: "https://modelviewer.dev",
    use: "Shows the painting on your wall in augmented reality.",
    licence: "Apache License 2.0",
    pkg: "@google/model-viewer",
  },
  {
    name: "Lit",
    url: "https://lit.dev",
    use: "Bundled inside <model-viewer>.",
    licence: "BSD 3-Clause",
    text: bsd3("2017 Google LLC"),
  },
  {
    name: "Astro",
    url: "https://astro.build",
    use: "Builds the site, and makes each painting grow into its page.",
    licence: "MIT",
    pkg: "astro",
  },
  {
    name: "Zod",
    url: "https://zod.dev",
    use: "Checks the studio's data on its way in.",
    licence: "MIT",
    pkg: "zod",
  },
  {
    name: "QR Code Generator",
    url: "https://github.com/kazuhikoarase/qrcode-generator",
    use: "Draws the studio's printable QR cards.",
    licence: "MIT",
    text: mit("2009 Kazuhiko Arase"),
  },
];
