# Learned

Vercel doesn't allow their free static hosting to be used for business purposes (Cloudflare/Netlify does).

You can use gmail to send emails subject to their [daily quota](https://developers.google.com/gmail/api/reference/quota)

Sendgrid is more for email campaigns, transactional emails at scale, analytics, etc.

## Pnpm

https://github.com/pnpm/pnpm/issues/8878#issuecomment-2546442011
https://github.com/pnpm/pnpm/releases/tag/v10.0.0-rc.0
https://github.com/pnpm/pnpm/issues/8378
https://pnpm.io/npmrc

Unlike npm/yarn, pnpm can hoist dependencies to the root of `node_modules` using public-hoist where the dependency will be available to every package, or you can hoist to `node_modules/.pnpm/node_modules` (the default) to benefit from the file/installation benefits of pnpm. Dependencies installed with pnpm are saved once in a store on your computer and away from your project. This means dependencies of dependencies (like `eslint-plugin-react-hooks`, which `eslint-config-next` relies on) aren’t automatically available at the root of `node_modules` unless explicitly hoisted with public-hoist. ESLint assumes plugins like `eslint-plugin-react-hooks` are globally accessible in `node_modules`, when they're not found you can get the error "failed to load plugin". 

Historically, public-hoist defaulted to ['*eslint*', '*prettier*'] (up to pnpm v9), but now in version 10 it's [].

```sh
# Until nextjs releases a flat config instead of that FlatCompat meme
public-hoist-pattern[]=*@nextui-org/*
public-hoist-pattern[]=*eslint*
public-hoist-pattern[]=*prettier*
```

## Image Review

```html
<picture>
  <source media="(max-width: 600px)" srcset="image-small.jpg">
  <source media="(min-width: 601px) and (max-width: 1200px)" srcset="image-medium.jpg">
  <source media="(min-width: 1201px)" srcset="image-large.jpg">
  <source media="(min-resolution: 192dpi)" srcset="image-large-3x.jpg">
  <img src="image-default.jpg" alt="Example Image">
</picture>
```

## Astro

I found out that NextJS <Image> optimization can only be used at request time, not build time.
I got the feeling that NextJS was fine for SSG but not ideal, most of the docs is written for SSR/RSC stuff.
Astro uses zod to generate typings for all my content which I liked (have to run `pnpm dev`).
It also had SSG Image optimization and more docs written for SSG which I liked.
