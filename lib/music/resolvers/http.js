import { ResolveError } from './errors.js';

// Some pages answer differently (or not at all) to unknown clients
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new ResolveError("This link doesn't exist anymore 🤷");
  if (!res.ok) throw new ResolveError(`The music service answered with an error (${res.status}), try again later`);
  return res;
}

export async function fetchText(url) {
  return (await fetchPage(url)).text();
}

export async function fetchJson(url) {
  return (await fetchPage(url)).json();
}

// Share links (spotify.link, link.deezer.com...) redirect to the real page
export async function followRedirects(url) {
  return new URL((await fetchPage(url)).url);
}
