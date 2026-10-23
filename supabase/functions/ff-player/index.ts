const allowedOrigin = "https://stiven20eduu.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function fetchJson(url, init = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal,
      redirect: "follow",
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizePlayer(data, fallbackRegion = "") {
  const sources = [
    data,
    data?.result,
    data?.data,
    data?.basicInfo,
    data?.basicinfo,
    data?.accountBasicInfo,
    data?.result?.basicInfo,
    data?.result?.basicinfo,
    data?.result?.accountBasicInfo,
    data?.data?.basicInfo,
    data?.data?.basicinfo,
    data?.data?.accountBasicInfo,
    data?.player,
  ].filter(Boolean);

  let nickname = "";
  let region = fallbackRegion;

  for (const source of sources) {
    nickname =
      nickname ||
      source?.nickname ||
      source?.Nickname ||
      source?.player_nickname ||
      source?.name ||
      "";

    region =
      region ||
      source?.region ||
      source?.Region ||
      source?.player_region ||
      source?.server ||
      "";
  }

  return {
    nickname: nickname ? String(nickname) : "",
    region: region ? String(region).toUpperCase() : "",
  };
}

async function tryPagoStore(uid, signal) {
  const hosts = [
    "https://shop.garena.my/api/auth/player_id_login",
    "https://pagostore.garena.com/api/auth/player_id_login",
  ];

  for (const url of hosts) {
    if (signal.aborted) return null;
    try {
      const result = await fetchJson(url, {
        signal,
        method: "POST",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://shop.garena.my/?app=100067",
        },
        body: JSON.stringify({
          app_id: 100067,
          login_id: uid,
        }),
      });

      console.log("ff-player source=garena status=" + result.status);

      if (!result.ok || result.data?.error) continue;

      // No intentamos eludir captcha/anti-bot.
      if (result.data?.url || result.data?.captcha) {
        continue;
      }

      const player = normalizePlayer(result.data);

      if (player.nickname) {
        return { ...player, source: "garena" };
      }
    } catch (error) {
      console.log("ff-player source=garena error");
    }
  }

  return null;
}

async function tryRegionApis(uid, signal) {
  const regions = ["SAC", "US", "NA", "BR"];

  for (const region of regions) {
    const urls = [
      {
        name: "freefireapis",
        url: `https://freefireapis.lat/info-player?uid=${encodeURIComponent(uid)}&region=${region}`,
      },
      {
        name: "squareweb",
        url: `https://freefirefwx-beta.squareweb.app/api/info_player?uid=${encodeURIComponent(uid)}&region=${region.toLowerCase()}&clothes=false`,
      },
      {
        name: "ffdvinh",
        url: `https://ffdvinh09-info.vercel.app/player-info?region=${region}&uid=${encodeURIComponent(uid)}`,
      },
    ];

    for (const source of urls) {
    if (signal.aborted) return null;
      try {
        const result = await fetchJson(source.url, { signal });

        console.log(
          `ff-player source=${source.name} region=${region} status=${result.status}`
        );

        if (
          result.status === 404 ||
          result.data?.error === "player_not_found" ||
          result.data?.type === "player_not_found"
        ) {
          continue;
        }

        if (!result.ok) {
          continue;
        }

        const player = normalizePlayer(result.data, region);

        if (player.nickname) {
          return {
            ...player,
            source: source.name,
          };
        }
      } catch (error) {
        console.log(
          `ff-player source=${source.name} region=${region} error`
        );
      }
    }
  }

  return null;
}

async function tryGlobalApi(uid, signal) {
  const urls = [
    {
      name: "glob-info2",
      url: `https://glob-info2.vercel.app/info?uid=${encodeURIComponent(uid)}`,
    },
  ];

  for (const source of urls) {
    if (signal.aborted) return null;
    try {
      const result = await fetchJson(source.url, { signal });

      console.log(
        `ff-player source=${source.name} status=${result.status}`
      );

      if (!result.ok) {
        continue;
      }

      const player = normalizePlayer(result.data);

      if (player.nickname) {
        return {
          ...player,
          source: source.name,
        };
      }
    } catch (error) {
      console.log(`ff-player source=${source.name} error`);
    }
  }

  return null;
}

const successCache = new Map();
const inFlight = new Map();

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";

  if (origin && origin !== allowedOrigin) {
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const url = new URL(req.url);
  const uid = (url.searchParams.get("uid") || "").trim();

  if (!/^\d{5,15}$/.test(uid)) {
    return json({ ok: false, error: "invalid_uid" }, 400);
  }

  const cached = successCache.get(uid);
  if (cached && cached.expires > Date.now()) return json(cached.data);
  successCache.delete(uid);

  if (!inFlight.has(uid)) {
    if (inFlight.size >= 100) return json({ ok: false, error: "lookup_unavailable" }, 503);
    const lookup = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const player = await Promise.any(
          [tryPagoStore, tryRegionApis, tryGlobalApi].map(async source => {
            const result = await source(uid, controller.signal);
            if (!result?.nickname) throw new Error("source_unavailable");
            return result;
          })
        );
        const data = { ok: true, uid, nickname: player.nickname, region: player.region || "" };
        if (successCache.size >= 200) successCache.delete(successCache.keys().next().value);
        successCache.set(uid, { data, expires: Date.now() + 60000 });
        return data;
      } catch {
        // A region-specific rejection or a dead endpoint cannot prove an ID does not exist.
        return { ok: false, error: "lookup_unavailable" };
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    };
    inFlight.set(uid, lookup().finally(() => inFlight.delete(uid)));
  }
  const data = await inFlight.get(uid);
  return json(data, data.ok ? 200 : 503);
});
