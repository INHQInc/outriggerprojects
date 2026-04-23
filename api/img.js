export default async function handler(req) {
  // Reconstruct the full outrigger URL from all query params
  // The URL comes as ?url=https://www.outrigger.com/path?quality=100&width=986...
  // So 'url' param gets just the base, and quality/width/etc become separate params
  const params = req.nextUrl.searchParams;
  let url = params.get('url');

  if (!url || !url.startsWith('https://www.outrigger.com/')) {
    return new Response('Bad request', { status: 400 });
  }

  // Rebuild query string: append all params except 'url' back to the URL
  const extraParams = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'url') {
      extraParams.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  }
  if (extraParams.length > 0) {
    url += (url.includes('?') ? '&' : '?') + extraParams.join('&');
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.outrigger.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    });

    if (!resp.ok) {
      return new Response('Upstream error: ' + resp.status, { status: resp.status });
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const body = await resp.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (e) {
    return new Response('Fetch failed: ' + e.message, { status: 502 });
  }
}

export const config = {
  runtime: 'edge',
};
