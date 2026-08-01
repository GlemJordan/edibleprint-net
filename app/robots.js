// No public/robots.txt existed before this — every route was implicitly
// crawlable. Admin pages are already access-gated by the ep_admin session
// (see lib/admin-auth.js), so this isn't the actual security boundary —
// it's defense in depth (well-behaved crawlers won't even fetch these) on
// top of the per-page noindex meta tags (which stop indexing if a page
// does get fetched some other way — e.g. a stray inbound link).
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin-login', '/api'],
      },
    ],
    sitemap: undefined,
  };
}
