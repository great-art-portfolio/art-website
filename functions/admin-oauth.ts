/**
 * Visits /admin -> github login -> this function -> give client token (to manipulate github repo)
 * @param {*} context 
 * @returns 
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  return new Response("Hello, from Admin OAuth!")
}