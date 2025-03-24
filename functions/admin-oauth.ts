import { clientId, repositoryUrl, workerUrl } from "../src/content.config";

// /login -> github login -> onRequestGet() -> /login-callback -> onRequestPost() -> /admin
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { state, code } = context.params

  console.log("context.request.url", context.request.url)

  // This will redirect to MY website, not the imposter's website 
  // Because the callbackURI on the Github App is hardcoded to https://art-website-cm4.pages.dev
  return Response.redirect(`/login-callback?code=${code}&state=${state}`, 302);
}

// /login -> github login -> onRequestGet() -> /login-callback -> onRequestPost() -> /admin
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { code }: { code: string } = await context.request.json();

  // Exchange code for token with GitHub, return token
  const githubTokenURL = `https://github.com/login/oauth/access_token?
    client_id=${clientId}&
    client_secret=${context.env.GITHUB_APP_CLIENT_SECRET}&
    code=${code}&
    redirect_uri=${workerUrl}&
    repository_id=${repositoryUrl}
  `

  const res = await fetch(githubTokenURL)

  return new Response();
};