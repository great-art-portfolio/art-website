# [Art Portfolio](https://github.com/great-art-portfolio/art-website)

[Deployed](https://art-website-cm4.pages.dev/)

[Cloudflare Settings](https://dash.cloudflare.com/ee6937662d7aeda01d2a6f1f49a1168a/pages/new/provider/github)

[Astro](https://docs.astro.build)

[Github OAuth](https://github.com/settings/applications/2929504)

```sh
pnpm install
pnpm dev
pnpm build   # /dist
pnpm preview # /dist preview

pnpm astro ... # Run CLI commands like `astro add`, `astro check`
pnpm astro -- --help

pnpm create astro@latest -- --template basics # what was used to make this template
```

[Font](https://fonts.google.com/specimen/Nothing+You+Could+Do)

Images follow a grid (same size) on the landing page, with individual links to their full size.

Paintings can be bought using [stripe](https://stripe.com/en-ca) + [shippo](https://goshippo.com/) + gmail.

## Animation

Images should have fade in and out.
The SVG signature should animate with strokes from ltr.

## Github

To create/delete/edit paintings, the painter visits /login to login to Github. 
Then they install my Github App if they haven't (authorize my app to access their account).
They then go through the OAuth process and redirected to /admin to manage paintings (with a new token).
