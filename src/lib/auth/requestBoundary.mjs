/**
 * @param {URL} requestUrl
 * @param {string} apiBaseUrl
 */
export function isCfsApiUrl(requestUrl, apiBaseUrl) {
  const apiUrl = new URL(apiBaseUrl);
  const basePath = apiUrl.pathname.replace(/\/+$/, "");
  return (
    requestUrl.origin === apiUrl.origin &&
    (!basePath ||
      requestUrl.pathname === basePath ||
      requestUrl.pathname.startsWith(`${basePath}/`))
  );
}
