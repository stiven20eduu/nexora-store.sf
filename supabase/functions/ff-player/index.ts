// NEXORA STORE - Free Fire player lookup.
// Private provider keys belong in Supabase Edge Function secrets, never GitHub.
const SITE_ORIGIN = "https://stiven20eduu.github.io";
const CORS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const successCache = new Map();
const failureCache = new Map();
const pending = new Map();
const UID_PATTERN = /^\d{5,15}$/;

function reply(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizePlayer(payload, uid, fallbackRegion = "") {
  if (!payload || typeof payload !== "object" ||
      payload.success === false || payload.ok === false ||
      payload.error || payload.status === "error") return null;

  // Only descend through account-level data. Never use the clan captain's name.
  const queue = [payload];
  const seen = new Set();
  const childKeys = [
    "data", "result", "basicInfo", "basicinfo", "accountBasicInfo",
    "accountInfo", "AccountInfo", "player", "playerInfo", "PlayerInfo",
  ];

  while (queue.length && seen.size < 24) {
    const obj = queue.shift();
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || seen.has(obj)) continue;
    seen.add(obj);

    const reportedUid = obj.accountId ?? obj.AccountId ?? obj.accountid ??
      obj.account_id ?? obj.uid ?? obj.UID ?? obj.player_id ??
      obj.playerId ?? obj.PlayerId ?? obj.player_id_login;
    if (reportedUid !== undefined && reportedUid !== null &&
        UID_PATTERN.test(String(reportedUid)) && String(reportedUid) !== uid) {
      continue;
    }

    const candidate = obj.nickname ?? obj.Nickname ?? obj.player_nickname ??
      obj.AccountName ?? obj.accountName ?? obj.accountname ??
      obj.playerName ?? obj.PlayerName ??
      (reportedUid != null ? obj.name : undefined);
    if (typeof candidate === "string") {
      const nickname = candidate.trim();
      if (nickname.length >= 1 && nickname.length <= 70 &&
          !/^(unknown|playername|nickname|not found|undefined|null|error|invalid id)$/i.test(nickname) &&
          !/[<>]/.test(nickname)) {
        const region = obj.region ?? obj.Region ?? obj.player_region ??
          obj.AccountRegion ?? obj.accountRegion ?? obj.server ?? fallbackRegion;
        return { nickname, region: String(region || "").toUpperCase() };
      }
    }

    for (const key of childKeys) {
      const nested = obj[key];
      if (nested && typeof nested === "object" && !seen.has(nested)) queue.push(nested);
    }
  }
  return null;
}

async function fetchJSON(url, opts, outerSignal, timeoutMs = 6500) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (outerSignal.aborted) throw new Error("aborted");
  outerSignal.addEventListener("abort", stop, { once: true });
  const timeout = setTimeout(stop, timeoutMs);
  try {
    const response = await fetch(url, {
      ...opts,
      signal: controller.signal,
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      return { status: response.status, ok: false, data: null };
    }
    const data = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, data };
  } finally {
    clearTimeout(timeout);
    outerSignal.removeEventListener("abort", stop);
  }
}

async function querySource(name, url, uid, signal, opts = {}, region = "") {
  try {
    const res = await fetchJSON(url, opts, signal);
    if (!res.ok) {
      console.log("ff-lookup provider=" + name + " http=" + res.status);
      return null;
    }
    const player = normalizePlayer(res.data, uid, region);
    console.log("ff-lookup provider=" + name + (player ? " match" : " no_profile"));
    return player;
  } catch (error) {
    console.log("ff-lookup provider=" + name + " unreachable");
    return null;
  }
}

function configuredProviders(uid, signal) {
  const lookups = [];
  const encoded = encodeURIComponent(uid);

  // Games Kinbo: auto-region Free Fire lookup, documented to support SAC.
  const kinboKey = Deno.env.get("FF_GAMESKINBO_API_KEY");
  if (kinboKey) {
    lookups.push(querySource(
      "gameskinbo",
      "https://api.gameskinbo.com/ff-info/get?uid=" + encoded + "&region=SAC",
      uid, signal,
      { headers: { "x-api-key": kinboKey, "Accept": "application/json" } }
    ));
  }

  // Free Fire Community: the BR endpoint also covers Latin America.
  const communityKey = Deno.env.get("FF_COMMUNITY_API_KEY");
  if (communityKey) {
    lookups.push(querySource(
      "freefirecommunity",
      "https://developers.freefirecommunity.com/api/v1/info?region=br&uid=" + encoded,
      uid, signal,
      { headers: {
        "x-api-key": communityKey,
        "Accept": "application/json",
        "User-Agent": "NexoraStore/1.0 (+https://stiven20eduu.github.io/nexora-store.sf/)",
      } },
      "SAC"
    ));
  }
  return lookups;
}

function publicProviders(uid, signal) {
  const id = encodeURIComponent(uid);
  // Several previous providers now return 404 or time out on valid-looking
  // requests. Use a separately operated, documented public nick route first.
  // An unavailable upstream is NEVER proof that an account is invalid.
  return [
    // BT System uses "br" for BR, SAC, US, NA and LATAM.
    // Using "sac" or "us" here can return 404 even for existing players.
    querySource("bt-nick-americas",
      "https://hostfreefire-api.squareweb.app/api/nick?id=" + id + "&region=br",
      uid, signal),
    querySource("bt-nick-auto",
      "https://hostfreefire-api.squareweb.app/api/nick?id=" + id,
      uid, signal),
    querySource("fwx-nick-auto",
      "https://freefirefwx-beta.squareweb.app/api/nick?id=" + id,
      uid, signal),
    querySource("nftoken-region",
      "https://api2.nftoken.info/get?uid=" + id + "&region=SAC",
      uid, signal),
  ];
}

async function resolve(uid) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 9500);
  try {
    const lookups = [...configuredProviders(uid, controller.signal),
      ...publicProviders(uid, controller.signal)];
    const successes = lookups.map(async (promise) => {
      const result = await promise;
      if (!result) throw new Error("provider_unavailable");
      return result;
    });
    const found = await Promise.any(successes);
    return { ok: true, uid, nickname: found.nickname, region: found.region };
  } catch {
    // Only an authoritative provider can establish that an ID doesn't exist.
    return { ok: false, error: "lookup_unavailable" };
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return reply({ ok: false, error: "forbidden_origin" }, 403);

  const uid = (new URL(request.url)).searchParams.get("uid")?.trim() || "";
  if (!UID_PATTERN.test(uid)) return reply({ ok: false, error: "invalid_uid" }, 400);

  const now = Date.now();
  const cached = successCache.get(uid);
  if (cached && now < cached.expires) return reply(cached.value);
  const recentFailure = failureCache.get(uid);
  if (recentFailure && now < recentFailure) return reply(
    { ok: false, error: "lookup_unavailable" }, 503
  );

  if (!pending.has(uid)) {
    if (pending.size >= 50) return reply({ ok: false, error: "busy" }, 503);
    const promise = resolve(uid).then(result => {
      if (result.ok) {
        if (successCache.size > 200) successCache.clear();
        successCache.set(uid, { value: result, expires: Date.now() + 120000 });
        failureCache.delete(uid);
      } else {
        if (failureCache.size > 200) failureCache.clear();
        failureCache.set(uid, Date.now() + 8000);
      }
      return result;
    }).finally(() => pending.delete(uid));
    pending.set(uid, promise);
  }

  const result = await pending.get(uid);
  return reply(result, result.ok ? 200 : 503);
});
