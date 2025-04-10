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
  <source media="(max-width: 600px)" srcset="image-small.jpg" />
  <source
    media="(min-width: 601px) and (max-width: 1200px)"
    srcset="image-medium.jpg"
  />
  <source media="(min-width: 1201px)" srcset="image-large.jpg" />
  <source media="(min-resolution: 192dpi)" srcset="image-large-3x.jpg" />
  <img src="image-default.jpg" alt="Example Image" />
</picture>
```

## Astro

I found out that NextJS <Image> optimization can only be used at request time, not build time.
I got the feeling that NextJS was fine for SSG but not ideal, most of the docs is written for SSR/RSC stuff.
Astro uses zod to generate typings for all my content which I liked (have to run `pnpm dev`).
It also had SSG Image optimization and more docs written for SSG which I liked.

## OAuth 2.0

A github login alone only verifies the user's identity, not the frontend's identity.
A bad actor can copy my entire frontend and host it on their own domain.
If the user signs into Github on the imposter site and redirects back, the imposter site gets the OAuth token.
I need my own server with a `client_secret` (identifying my app) that github redirects to instead.

The URL for requesting a Github token can also be forged by a bad actor (user can be tricked into calling it).
To make sure it's an authentic request, I attach a nonce/state to the request.
When my server gets a callback from the Github server, it will check if the response nonce matches the client nonce.

CSRF isn't just about cookies.

/login -> github login -> /admin-oauth -> /admin -> /admin-oauth -> /admin (now with token)

After a successful login, it redirects the browser to /admin-oauth, then it redirects the browser to /admin-callback with `code` and `state` to check if the state is a match, then it makes a post request to `/admin-oauth` to get the token, then it redirects again to /admin with the token.

## Redirects

Redirects can be server-driven (e.g., 302 with Location header) or client-driven `window.location.href = newURL`
Redirects are common for OAuth flows, page moves, and routing users post-action (login -> dashboard)
300 codes are mostly redirects

## Window opener

https://developer.mozilla.org/en-US/docs/Glossary/Browsing_context
https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel#nofollow

`rel=noreferrer` drops my website from being associated with the user's next navigation (appears as new traffic)
`rel=nofollow` my site doesn't endorse this link (could be user generated content) and the search engine will ignore the link relationship.
`rel=noopener` makes sure the new tab/window isn't connected to the original page.

A browsing context is an environment in which a browser displays a document (tab, window, iframe).
You can create an auxiliary browsing context using `window.open()` and `window.opener` will have the original window that opened it.
You can also use `target=""` to create a browsing context

window.open() was originally used for opening help pages, external tools, multi-window apps but it's rare.
You may see window.open() for multi-window OAuth workflows though not mine (github OAuth doesn't do that).
window.opener lets you control the original window that opened this one (closing it, redirecting it)
You can have a chain of openers A -> B -> C in a parent-child hierarchy

window.alert(), window.prompt(), window.confirm() are all dialogues, not contexts.

`target=""` specifies where to open the new tab https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#target

Iframes allow the insertion of a document from an entirely different domain.
