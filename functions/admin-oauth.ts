/**
 * Visits /admin -> github login -> this function -> give client token (to manipulate github repo)
 * @param {*} context 
 * @returns 
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { state, code } = context.params
  return Response.redirect(`/admin?code=${code}&state=${state}`, 302);
}
