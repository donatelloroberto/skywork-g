(function() {
  const DEFAULT_BASE = "https://nurgay.to";
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };

  function baseUrl() {
    return (typeof manifest !== "undefined" && manifest.baseUrl) ? manifest.baseUrl.replace(/\/$/, "") : DEFAULT_BASE;
  }

  function abs(url, base) {
    if (!url) return "";
    url = String(url).replace(/&amp;/g, "&").trim();
    if (!url || url === "#" || url.startsWith("javascript:")) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (/^https?:\/\//i.test(url)) return url;
    try {
      return new URL(url, base || baseUrl() + "/").toString();
    } catch (_) {
      return "";
    }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
  }

  function text(el, selector) {
    const n = selector ? el.querySelector(selector) : el;
    return n && n.textContent ? n.textContent.trim().replace(/\s+/g, " ") : "";
  }

  function attr(el, selector, names) {
    const n = selector ? el.querySelector(selector) : el;
    if (!n) return "";
    for (const name of names) {
      const v = n.getAttribute(name);
      if (v) return v.trim();
    }
    return "";
  }

  function isVideoPage(url) {
    const h = hostOf(url);
    if (!h || !h.includes("nurgay.to")) return true;
    return !/[?&]filter=|\/page\/|\/category\/|\/tag\/|\/models?\/|\/pornstars?\/|\/search/i.test(url);
  }

  function itemFromArticle(el) {
    const href = abs(attr(el, "a[href]", ["href"]));
    if (!href || !isVideoPage(href)) return null;
    const title = text(el, "header.entry-header span") || attr(el, "img", ["title", "alt"]) || text(el, "a");
    if (!title) return null;
    const poster = abs(attr(el, "img", ["data-src", "data-lazy-src", "data-original", "src"]));
    return new MultimediaItem({
      title,
      url: href,
      posterUrl: poster,
      type: "movie",
      isAdult: true,
      contentRating: "18+",
      playbackPolicy: "VPN Recommended",
      headers: { "Referer": baseUrl() }
    });
  }

  function parseArticles(doc) {
    return Array.from(doc.querySelectorAll("article.loop-video"))
      .map(itemFromArticle)
      .filter(Boolean);
  }

  async function fetchDoc(url, referer) {
    const res = await http_get(url, { ...HEADERS, "Referer": referer || baseUrl() });
    return { html: res.body || "", doc: await parseHtml(res.body || "") };
  }

  async function getHome(cb) {
    try {
      const categories = [
        ["Latest", "/?filter=latest"],
        ["Most Viewed", "/?filter=most-viewed"],
        ["Asian", "/asiaten"],
        ["Bears", "/bären"],
        ["Bareback", "/bareback"],
        ["Bisexual", "/bisex"],
        ["Blowjob", "/blasen"],
        ["Cumshot", "/cumshots"],
        ["Group Sex", "/gruppensex"],
        ["Hardcore", "/hardcore"],
        ["Hunks", "/hunks"],
        ["Latino", "/latino"],
        ["Muscle", "/muskeln"],
        ["Outdoor", "/outdoor"],
        ["Twinks", "/twinks"],
        ["Vintage", "/vintage"]
      ];
      const data = {};
      for (const [name, path] of categories) {
        try {
          const { doc } = await fetchDoc(abs(path), baseUrl());
          const list = parseArticles(doc);
          if (list.length) data[name] = list;
        } catch (_) {}
      }
      cb({ success: true, data });
    } catch (e) {
      cb({ success: false, errorCode: "PARSE_ERROR", message: e.stack || String(e) });
    }
  }

  async function search(query, cb) {
    try {
      const all = [];
      const seen = new Set();
      for (let i = 1; i <= 7; i++) {
        const url = `${baseUrl()}/?s=${encodeURIComponent(query || "")}&page=${i}`;
        const { doc } = await fetchDoc(url, baseUrl());
        const items = parseArticles(doc);
        if (!items.length) break;
        for (const it of items) {
          if (!seen.has(it.url)) { seen.add(it.url); all.push(it); }
        }
      }
      cb({ success: true, data: all });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.stack || String(e) });
    }
  }

  function extractTags(doc) {
    return Array.from(doc.querySelectorAll("a[rel='tag'], .entry-tags a, .post-tags a, .tags a, a.tag, .video-tags a"))
      .map(a => text(a)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  }

  function extractActors(doc) {
    return Array.from(doc.querySelectorAll(".models a, .performers a, a.model, .cast a, .pornstars a, div.actors a"))
      .map(a => text(a)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
      .map(name => new Actor({ name }));
  }

  async function load(url, cb) {
    try {
      const { doc } = await fetchDoc(url, baseUrl());
      const title = attr(doc, "meta[property='og:title']", ["content"]) || text(doc, "h1") || "Untitled";
      const poster = abs(attr(doc, "meta[property='og:image']", ["content"]) || attr(doc, "video[poster]", ["poster"]));
      const description = attr(doc, "meta[property='og:description']", ["content"]);
      const recommendations = parseArticles(doc).filter(x => x.url !== url);
      const item = new MultimediaItem({
        title,
        url,
        posterUrl: poster,
        bannerUrl: poster,
        description,
        type: "movie",
        isAdult: true,
        contentRating: "18+",
        playbackPolicy: "VPN Recommended",
        tags: extractTags(doc),
        cast: extractActors(doc),
        recommendations,
        headers: { "Referer": baseUrl() }
      });
      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.stack || String(e) });
    }
  }

  function addDirectMatches(html, out, referer, source) {
    const re = /https?:\/\/[^\s'"<>\\]+?\.(?:m3u8|mp4|webm)(?:\?[^'"\s<>\\]*)?/gi;
    let m;
    while ((m = re.exec(html || "")) !== null) {
      out.push(new StreamResult({ url: m[0].replace(/\\\//g, "/").replace(/&amp;/g, "&"), source: source || "Direct", headers: { "Referer": referer || baseUrl() } }));
    }
  }

  function qualityFromUrl(url) {
    const m = String(url).match(/(2160|1440|1080|720|480|360|240)p?/i);
    return m ? `${m[1]}p` : undefined;
  }

  function uniqueStreams(streams) {
    const seen = new Set();
    return streams.filter(s => {
      if (!s || !s.url || seen.has(s.url)) return false;
      seen.add(s.url);
      if (!s.quality) s.quality = qualityFromUrl(s.url);
      return true;
    });
  }

  async function resolveDoodLike(url, referer, sourceName) {
    const streams = [];
    const res = await http_get(url, { ...HEADERS, "Referer": referer || url });
    const html = res.body || "";
    const pass = html.match(/\/pass_md5\/[^'"<>\s]+/);
    if (!pass) { addDirectMatches(html, streams, url, sourceName); return streams; }
    const token = pass[0].split("/").pop();
    const origin = new URL(url).origin;
    const md5Res = await http_get(origin + pass[0], { ...HEADERS, "Referer": url });
    const rand = Math.random().toString(36).slice(2, 12);
    const finalUrl = `${(md5Res.body || "").trim()}${rand}?token=${token}&expiry=${Date.now()}`;
    streams.push(new StreamResult({ url: finalUrl, source: sourceName || hostOf(url), headers: { "Referer": origin } }));
    return streams;
  }

  async function resolveVoe(url, referer) {
    const streams = [];
    const res = await http_get(url, { ...HEADERS, "Referer": referer || url });
    const html = res.body || "";
    const m = html.match(/const\s+sources\s*=\s*(\{[\s\S]*?\});/);
    if (m) {
      try {
        const obj = JSON.parse(m[1].replace(/,\s*}/g, "}"));
        if (obj.hls) streams.push(new StreamResult({ url: obj.hls, source: "Voe", headers: { "Referer": url }, quality: obj.video_height ? `${obj.video_height}p` : undefined }));
      } catch (_) {}
    }
    addDirectMatches(html, streams, url, "Voe");
    return streams;
  }

  async function resolveListMirror(url, referer, depth) {
    const streams = [];
    const { html } = await fetchDoc(url, referer || baseUrl());
    const m = html.match(/sources\s*=\s*(\[[\s\S]*?\]);/);
    if (m) {
      try {
        const arr = JSON.parse(m[1]);
        for (const obj of arr) {
          if (obj && obj.url) streams.push(...await resolveHost(abs(obj.url, url), url, depth + 1));
        }
      } catch (_) {}
    }
    addDirectMatches(html, streams, url, "ListMirror");
    return streams;
  }

  async function resolveBigwarp(url, referer) {
    const streams = [];
    let target = url;
    try {
      const res0 = await http_get(url, { ...HEADERS, "Referer": referer || url });
      const html = res0.body || "";
      const file = html.match(/file:\s*["']((?:https?:)?\/\/[^"']+)/i) || html.match(/source\s*src=["']([^"']+)/i);
      if (file) streams.push(new StreamResult({ url: abs(file[1], url), source: "Bigwarp", headers: { "Referer": "" } }));
      addDirectMatches(html, streams, url, "Bigwarp");
    } catch (_) {}
    return streams;
  }

  async function resolveGeneric(url, referer, depth) {
    const streams = [];
    const { html, doc } = await fetchDoc(url, referer || baseUrl());
    addDirectMatches(html, streams, url, hostOf(url) || "Direct");
    Array.from(doc.querySelectorAll("video[src], source[src], video[data-src], source[data-src], a[href*='.mp4'], a[href*='.m3u8'], a[href*='.webm']")).forEach(el => {
      const u = attr(el, null, ["src", "data-src", "href"]);
      if (u) streams.push(new StreamResult({ url: abs(u, url), source: hostOf(url) || "Direct", headers: { "Referer": url } }));
    });
    if (depth < 2) {
      const frames = Array.from(doc.querySelectorAll("iframe[src]")).map(f => abs(f.getAttribute("src"), url)).filter(Boolean);
      for (const frame of frames) streams.push(...await resolveHost(frame, url, depth + 1));
    }
    return streams;
  }

  async function resolveHost(url, referer, depth) {
    const h = hostOf(url);
    try {
      if (h.includes("listmirror.com")) return await resolveListMirror(url, referer, depth || 0);
      if (h.includes("voe") || h.includes("jilliandescribecompany.com")) return await resolveVoe(url, referer);
      if (h.includes("d-s.io")) return await resolveDoodLike(url, referer, "dsio");
      if (h.includes("dood") || h.includes("vide0.net")) return await resolveDoodLike(url, referer, h.includes("vide0") ? "vide0" : "DoodStream");
      if (h.includes("bigwarp") || h.includes("bgwp.cc")) return await resolveBigwarp(url, referer);
      return await resolveGeneric(url, referer, depth || 0);
    } catch (_) {
      return [];
    }
  }

  async function loadStreams(url, cb) {
    try {
      const { html, doc } = await fetchDoc(url, baseUrl());
      const streams = [];
      addDirectMatches(html, streams, url, "Nurgay");

      const mirrors = [];
      Array.from(doc.querySelectorAll("ul#mirrorMenu a.mirror-opt, a.dropdown-item.mirror-opt")).forEach(a => {
        const u = a.getAttribute("data-url");
        if (u && u !== "#") mirrors.push(abs(u, url));
      });
      if (!mirrors.length) {
        Array.from(doc.querySelectorAll("iframe[src]")).forEach(f => mirrors.push(abs(f.getAttribute("src"), url)));
      }
      for (const mirror of [...new Set(mirrors)]) {
        streams.push(...await resolveHost(mirror, url, 0));
      }

      cb({ success: true, data: uniqueStreams(streams) });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.stack || String(e) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
