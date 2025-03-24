// Visits /admin -> github login -> this function -> give client token (to manipulate github repo)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { state, code } = context.params
  return Response.redirect(`/admin?code=${code}&state=${state}`, 302);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // const { code } = await context.request.json();
  // Exchange code for token with GitHub, return token

  return new Response();
};