(function () {
  const DEFAULT_BASE = "https://gay.xtapes.in";
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };

  const MAIN_PAGES = [
    ["/?filtre=date&cat=0", "Latest"],
    ["/category/porn-movies-214660", "Full Movies"],
    ["/category/groupsex-gangbang-porn-189457", "Gang bang & Group"],
    ["/category/860425", "Corbin Fisher"],
    ["/category/139616", "Timtales"],
    ["/category/687469", "Bel Ami"],
    ["/category/651571", "Broke Straight Boys"],
    ["/category/850356", "BroMo"],
    ["/category/847926", "CockyBoys"],
    ["/category/346893", "Sean Cody"],
    ["/category/62478", "Fraternity X"],
    ["/category/416510", "Falcon Studio"],
    ["/category/37433", "Gay Hoopla"],
    ["/category/621537", "Onlyfans"]
  ];

  function baseUrl() {
    return (typeof manifest !== "undefined" && manifest.baseUrl)
      ? manifest.baseUrl.replace(/\/$/, "")
      : DEFAULT_BASE;
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function absoluteUrl(url, base) {
    if (!url) return "";
    let value = String(url).trim().replace(/&amp;/g, "&");
    if (!value || value === "#" || value.startsWith("javascript:")) return "";
    if (value.startsWith("//")) return "https:" + value;
    if (/^https?:\/\//i.test(value)) return value;
    try {
      return new URL(value, base || baseUrl() + "/").toString();
    } catch (_) {
      return "";
    }
  }

  async function fetchText(url, referer) {
    const response = await http_get(url, { ...HEADERS, Referer: referer || baseUrl() });
    return response && response.body ? response.body : "";
  }

  async function fetchDoc(url, referer) {
    const html = await fetchText(url, referer);
    return { html, doc: await parseHtml(html) };
  }

  function firstAttr(root, selector, attrs) {
    const el = root.querySelector(selector);
    if (!el) return "";
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (value) return value;
    }
    return "";
  }

  function toSearchItem(li) {
    const link = li.querySelector("a[href]");
    const img = li.querySelector("img");
    const href = link ? absoluteUrl(link.getAttribute("href"), baseUrl()) : "";
    if (!href || !/\/video\//i.test(href)) return null;

    const title = cleanText(
      (img && (img.getAttribute("title") || img.getAttribute("alt"))) ||
      firstAttr(li, "a[title]", ["title"]) ||
      li.textContent ||
      "Untitled"
    );

    const poster = absoluteUrl(
      (img && (img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("src"))) || "",
      baseUrl()
    );

    if (!title || title.toLowerCase() === "untitled") return null;

    return new MultimediaItem({
      title,
      url: href,
      posterUrl: poster,
      type: "movie",
      isAdult: true,
      contentRating: "18+",
      headers: { Referer: baseUrl() }
    });
  }

  function parseListing(doc) {
    const items = [];
    doc.querySelectorAll("ul.listing-tube li").forEach((li) => {
      const item = toSearchItem(li);
      if (item && !items.some((x) => x.url === item.url)) items.push(item);
    });
    return items;
  }

  async function getHome(cb) {
    try {
      const data = {};
      for (const [path, name] of MAIN_PAGES) {
        try {
          const { doc } = await fetchDoc(`${baseUrl()}${path}`, baseUrl());
          const list = parseListing(doc);
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
      const out = [];
      const q = encodeURIComponent(query || "");
      for (let page = 1; page <= 5; page++) {
        const { doc } = await fetchDoc(`${baseUrl()}/page/${page}/?s=${q}`, baseUrl());
        const results = parseListing(doc);
        if (!results.length) break;
        for (const item of results) {
          if (!out.some((x) => x.url === item.url)) out.push(item);
        }
      }
      cb({ success: true, data: out });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.stack || String(e) });
    }
  }

  async function load(url, cb) {
    try {
      const { doc } = await fetchDoc(url, baseUrl());
      const title = cleanText(
        firstAttr(doc, "meta[property='og:title']", ["content"]) ||
        firstAttr(doc, "meta[name='twitter:title']", ["content"]) ||
        (doc.querySelector("h1") && doc.querySelector("h1").textContent) ||
        "Untitled"
      );
      const posterUrl = absoluteUrl(
        firstAttr(doc, "meta[property='og:image']", ["content"]) ||
        firstAttr(doc, "meta[name='twitter:image']", ["content"]) ||
        firstAttr(doc, "video[poster]", ["poster"]),
        url
      );
      const description = cleanText(
        firstAttr(doc, "meta[property='og:description']", ["content"]) ||
        firstAttr(doc, "meta[name='description']", ["content"])
      );
      const recommendations = parseListing(doc);

      cb({
        success: true,
        data: new MultimediaItem({
          title,
          url,
          posterUrl,
          bannerUrl: posterUrl,
          description,
          type: "movie",
          isAdult: true,
          contentRating: "18+",
          recommendations,
          playbackPolicy: "VPN Recommended",
          headers: { Referer: baseUrl() }
        })
      });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.stack || String(e) });
    }
  }

  function pushStream(out, url, source, referer, quality) {
    const fixed = absoluteUrl(url, referer || baseUrl());
    if (!fixed || !/^https?:\/\//i.test(fixed)) return;
    if (out.some((x) => x.url === fixed)) return;
    out.push(new StreamResult({
      url: fixed,
      source: source || "Direct",
      quality: quality || undefined,
      headers: { Referer: referer || baseUrl() }
    }));
  }

  function addDirectMatches(html, out, source, referer) {
    if (!html) return;
    const decoded = html
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/\u0026/g, "&");
    const re = /https?:\/\/[^\s'"<>\\]+?\.(?:m3u8|mp4|webm)(?:\?[^\s'"<>\\]*)?/gi;
    let m;
    while ((m = re.exec(decoded)) !== null) {
      pushStream(out, m[0], source || "Direct", referer);
    }
  }

  function unpackDeanEdwards(source) {
    const match = /eval\(function\(p,a,c,k,e,(?:r|d)\)\{[\s\S]*?\}\((['"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\5\.split\('\|'\)/.exec(source);
    if (!match) return "";
    let payload = match[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const radix = parseInt(match[3], 10);
    const count = parseInt(match[4], 10);
    const symtab = match[6].split("|");
    for (let i = count - 1; i >= 0; i--) {
      const word = symtab[i];
      if (!word) continue;
      payload = payload.replace(new RegExp("\\b" + i.toString(radix) + "\\b", "g"), word);
    }
    return payload;
  }

  function parsePackedLinks(html, out, referer) {
    const unpacked = unpackDeanEdwards(html);
    if (!unpacked) return;
    addDirectMatches(unpacked, out, "GXtapes Packed", referer);
    const idx = unpacked.indexOf("var links={");
    if (idx >= 0) {
      const body = unpacked.substring(idx + "var links={".length).split("};")[0];
      const pairRe = /['"]?([^'":,{}]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
      let p;
      while ((p = pairRe.exec(body)) !== null) {
        pushStream(out, p[2], `GXtapes ${p[1]}`, referer);
      }
    }
  }

  async function resolveDood(url, out, referer) {
    const html = await fetchText(url, referer || "https://doodstream.com");
    addDirectMatches(html, out, "DoodStream", url);
    const pass = /\/pass_md5\/[^'"\s<>]+/.exec(html);
    if (!pass) return;
    const main = (url.match(/^https?:\/\/[^/]+/i) || ["https://doodstream.com"])[0];
    const token = pass[0].split("/").pop();
    const videoData = await fetchText(main + pass[0], main + "/" + url.split("/").pop());
    if (!videoData) return;
    const random = Math.random().toString(36).slice(2, 12);
    pushStream(out, `${videoData}${random}?token=${token}&expiry=${Date.now()}`, "DoodStream", main);
  }

  async function resolveVidXtapes(url, out, referer) {
    const html = await fetchText(url, referer || baseUrl());
    addDirectMatches(html, out, "VID Xtapes", url);
    const srcMatch = /src\s*:\s*['"]([^'"]+)['"]/.exec(html);
    if (srcMatch) pushStream(out, srcMatch[1], "VID Xtapes", referer || url);
  }

  async function resolveGxPacked(url, out, referer) {
    const html = await fetchText(url, referer || baseUrl());
    addDirectMatches(html, out, "GXtapes", url);
    parsePackedLinks(html, out, url);
  }

  async function resolveFrame(url, out, referer, depth) {
    if (!url || depth > 3) return;
    const lower = url.toLowerCase();
    try {
      if (lower.includes("dood")) return await resolveDood(url, out, referer);
      if (lower.includes("vid.xtapes.in")) return await resolveVidXtapes(url, out, referer);
      if (lower.includes("74k.io") || lower.includes("/e/")) return await resolveGxPacked(url, out, referer);

      const html = await fetchText(url, referer || baseUrl());
      addDirectMatches(html, out, "Direct", url);
      parsePackedLinks(html, out, url);
      const doc = await parseHtml(html);

      doc.querySelectorAll("video[src], source[src], video[data-src], source[data-src]").forEach((el) => {
        const direct = el.getAttribute("src") || el.getAttribute("data-src");
        if (direct) pushStream(out, direct, "HTML Video", url);
      });

      const nested = [];
      doc.querySelectorAll("#video-code iframe[src], iframe[src]").forEach((iframe) => {
        const src = absoluteUrl(iframe.getAttribute("src"), url);
        if (src && !nested.includes(src)) nested.push(src);
      });
      for (const src of nested) await resolveFrame(src, out, url, depth + 1);
    } catch (_) {}
  }

  async function loadStreams(url, cb) {
    try {
      const out = [];
      const { html, doc } = await fetchDoc(url, baseUrl());
      addDirectMatches(html, out, "Page Direct", url);
      parsePackedLinks(html, out, url);

      const frames = [];
      doc.querySelectorAll("#video-code iframe[src], iframe[src]").forEach((iframe) => {
        const src = absoluteUrl(iframe.getAttribute("src"), url);
        if (src && !frames.includes(src)) frames.push(src);
      });

      for (const frame of frames) await resolveFrame(frame, out, url, 0);
      cb({ success: true, data: out });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.stack || String(e) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
