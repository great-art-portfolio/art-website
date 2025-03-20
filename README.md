# [Art Portfolio](https://github.com/great-art-portfolio/art-website)

[Deployed here](https://art-website-cm4.pages.dev/)

[Astro](https://docs.astro.build)

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

To create new paintings, the owner logs into Github OAuth.
Should take her to the admin page after where she can do stuff with the OAuth token.

## Selling

Payments handled with [Stripe](https://stripe.com/en-ca) and shipping with [shippo](https://goshippo.com/)
