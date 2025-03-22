# [Art Portfolio](https://github.com/great-art-portfolio/art-website)

[Deployed here](https://art-website-cm4.pages.dev/)

[Cloudflare](https://dash.cloudflare.com/ee6937662d7aeda01d2a6f1f49a1168a/pages/new/provider/github)

[Astro](https://docs.astro.build)

[OAuth](https://github.com/settings/applications/2929504)

```sh
pnpm install
pnpm dev
pnpm build   # /dist
pnpm preview # /dist preview

pnpm astro ... # Run CLI commands like `astro add`, `astro check`
pnpm astro -- --help

pnpm create astro@latest -- --template basics # what was used to make this template
```

## Design

[Font](https://fonts.google.com/specimen/Nothing+You+Could+Do)

Images will appear in the same box size for the landing page, and then their natural size in 
Landing page for showing different paintings, sell them with shippo + stripe.
Admin page where the owner can add new art, post to social media, create descriptions from art.

## Animation

The images should have fade in and out.
The SVG signature should animate with strokes from ltr.

## Github

To create/delete/edit paintings, the site owner visits /admin where they'll be redirected to the Github login. 
They'll sign into Github, and then install my "Github App" to their account (authorize my app to access their account).
They can then get an Authz token from the Github App that they can then use to make changes to the github repository (REST API).

## Selling

Payments handled with [Stripe](https://stripe.com/en-ca) and shipping with [shippo](https://goshippo.com/)
