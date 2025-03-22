/**
 * Visits /admin -> github login -> this function -> give client token (to manipulate github repo)
 * @param {*} context 
 * @returns 
 */
export function onRequest(context) {
  return new Response("Hello, from Admin OAuth!")
}