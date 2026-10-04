const ALLOWED_ORIGINS = new Set([
  "https://stiven20eduu.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function setCors(req, res) {
  const origin = req.headers.origin || "";

  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function normalizePlayer(data, fallbackRegion = "") {
  const sources = [
    data,
    data?.result,
    data?.basicInfo,
    data?.basicinfo,
    data?.accountBasicInfo,
    data?.player,
    data?.data
  ].filter(Boolean);

  let nickname = "";
  let region = fallbackRegion;

  for (const source of sources) {
    nickname =
      nickname ||
      source?.nickname ||
      source?.player_nickname ||
      source?.name ||
      "";

    region =
      region ||
      source?.region ||
      source?.player_region ||
      source?.server ||
      "";
  }

  return {
    nickname: nickname ? String(nickname) : "",
    region: region ? String(region).toUpperCase() : ""
  };
}

async function fetchJson(url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow"
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
      data
    };
  } finally {
    clearTimeout(timer);
  }
}

async function tryPagoStore(uid) {
  const hosts = [
    "https://pagostore.garena.com/api/auth/player_id_login",
    "https://pagostore.com/api/auth/player_id_login"
  ];

  for (const url of hosts) {
    try {
      const result = await fetchJson(url, {
        method: "POST",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://pagostore.garena.com/"
        },
        body: JSON.stringify({
          app_id: 100067,
          login_id: uid
        })
      });

      if (result.status === 404) {
        continue;
      }

      if (result.data?.error === "invalid_id") {
        return { notFound: true };
      }

      // No intentamos evadir CAPTCHA/anti-bot de Garena.
      if (result.data?.url || result.data?.captcha) {
        continue;
      }

      const player = normalizePlayer(result.data);

      if (player.nickname) {
        return player;
      }
    } catch {
      // Intentamos la siguiente fuente.
    }
  }

  return null;
}

async function tryPublicRegionApi(uid) {
  const urls = [
    `https://freefirefwx-beta.squareweb.app/api/region?id=${encodeURIComponent(uid)}`,
    `https://api-info.ffapi.cloud/api/region?id=${encodeURIComponent(uid)}`
  ];

  for (const url of urls) {
    try {
      const result = await fetchJson(url);

      if (result.status === 404 || result.data?.error === "player_not_found") {
        continue;
      }

      const player = normalizePlayer(result.data);

      if (player.nickname) {
        return player;
      }
    } catch {
      // Intentamos la siguiente fuente.
    }
  }

  return null;
}

async function tryInfoApi(uid) {
  const regions = ["SAC", "US", "BR", "SG"];

  for (const region of regions) {
    const urls = [
      `https://api-info.ffapi.cloud/api/info_player?uid=${encodeURIComponent(uid)}&region=${region.toLowerCase()}`,
      `https://freefireinfo-zy9l.onrender.com/api/v1/player-profile?uid=${encodeURIComponent(uid)}&server=${region}`
    ];

    for (const url of urls) {
      try {
        const result = await fetchJson(url);

        if (!result.ok) {
          continue;
        }

        const player = normalizePlayer(result.data, region);

        if (player.nickname) {
          return player;
        }
      } catch {
        // Intentamos la siguiente fuente.
      }
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  const uid = String(req.query?.uid || "").trim();

  if (!/^\d{5,15}$/.test(uid)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_uid"
    });
  }

  try {
    const sources = [
      tryPagoStore,
      tryPublicRegionApi,
      tryInfoApi
    ];

    for (const source of sources) {
      const player = await source(uid);

      if (player?.notFound) {
        return res.status(404).json({
          ok: false,
          error: "player_not_found"
        });
      }

      if (player?.nickname) {
        return res.status(200).json({
          ok: true,
          uid,
          nickname: player.nickname,
          region: player.region || ""
        });
      }
    }

    return res.status(503).json({
      ok: false,
      error: "lookup_unavailable"
    });
  } catch {
    return res.status(503).json({
      ok: false,
      error: "lookup_unavailable"
    });
  }
};
