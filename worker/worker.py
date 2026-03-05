#!/usr/bin/env python3
"""
Analyzer Market AI Worker (V17)

- Polls jobs via /api/worker/claim
- Fetches analysis input via /api/worker/analysis/[id]
- Uses Google Places Text Search (optional) + Supabase cache (/api/worker/places-cache/get|set)
- Generates structured report via OpenAI (JSON) with strict fallbacks
- Sends completion via /api/worker/complete
- Heartbeat to keep lease alive

Security:
- Every request to /api/worker/* is signed with HMAC (ts + nonce + body)
"""

import os
import time
import json
import hmac
import hashlib
import secrets
import requests
from threading import Thread, Event
from typing import Any, Dict, List, Optional, Tuple

API_BASE = os.getenv("API_BASE", os.getenv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000")).rstrip("/")
WORKER_SECRET = os.getenv("WORKER_SECRET", "")
LOCK_OWNER = os.getenv("LOCK_OWNER", "worker-1")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")

# Per-analysis cost controls (defaults; analysis row may override)
MAX_OPENAI_TOKENS_DEFAULT = int(os.getenv("MAX_OPENAI_TOKENS", "1200"))
MAX_OPENAI_COST_CENTS_DEFAULT = int(os.getenv("MAX_OPENAI_COST_CENTS", "12"))
OPENAI_COST_PER_1K_TOKENS_CENTS = float(os.getenv("OPENAI_COST_PER_1K_TOKENS_CENTS", "2.0"))
MAX_PLACES_CALLS_DEFAULT = int(os.getenv("MAX_PLACES_CALLS", "5"))

# Global daily caps (0 disables). Enforced by server RPC via /api/worker/daily/consume
MAX_DAILY_OPENAI_CENTS = int(os.getenv("MAX_DAILY_OPENAI_CENTS", "0"))
MAX_DAILY_PLACES_CALLS = int(os.getenv("MAX_DAILY_PLACES_CALLS", "0"))

# Places cache TTL (server caps to 30 days)
PLACES_CACHE_TTL_SECONDS = int(os.getenv("PLACES_CACHE_TTL_SECONDS", str(7 * 86400)))

HEARTBEAT_SECONDS = int(os.getenv("HEARTBEAT_SECONDS", "45"))
CLAIM_SLEEP_SECONDS = float(os.getenv("CLAIM_SLEEP_SECONDS", "2.0"))

# If true, failures in daily cap checks fail-open. In production, keep false to protect margin.
BETA_FAIL_OPEN_DAILY = os.getenv("BETA_FAIL_OPEN_DAILY", "false").lower() == "true"


def _hmac_headers(raw_body: bytes) -> Dict[str, str]:
    ts = str(int(time.time()))
    nonce = secrets.token_urlsafe(16)
    msg = (ts + "." + nonce + ".").encode("utf-8") + raw_body
    sig = hmac.new(WORKER_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return {
        "x-worker-ts": ts,
        "x-worker-nonce": nonce,
        "x-worker-sig": sig,
        "content-type": "application/json",
    }


def _post(path: str, payload: Dict[str, Any], timeout: int = 30) -> requests.Response:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = _hmac_headers(raw)
    return requests.post(API_BASE + path, headers=headers, data=raw, timeout=timeout)


def _daily_consume(kind: str, amount: int) -> bool:
    """Consume from global daily budgets via server. Returns True if allowed."""
    try:
        r = _post("/api/worker/daily/consume", {"kind": kind, "amount": int(amount)}, timeout=20)
        if r.status_code != 200:
            return True if BETA_FAIL_OPEN_DAILY else False
        data = r.json() or {}
        return bool(data.get("ok", True))
    except Exception:
        return True if BETA_FAIL_OPEN_DAILY else False


def _places_cache_get(cache_key: str) -> Optional[Dict[str, Any]]:
    try:
        r = _post("/api/worker/places-cache/get", {"cache_key": cache_key}, timeout=20)
        if r.status_code != 200:
            return None
        return (r.json() or {}).get("value")
    except Exception:
        return None


def _places_cache_set(cache_key: str, value: Dict[str, Any], ttl_seconds: int) -> None:
    try:
        _post("/api/worker/places-cache/set", {"cache_key": cache_key, "value": value, "ttl_seconds": int(ttl_seconds)}, timeout=20)
    except Exception:
        pass


def _places_text_search(query: str, region: str = "") -> Tuple[List[Dict[str, Any]], int, str]:
    """
    Returns: (items, calls, raw_status)
    Each item is minimized and safe to cache.
    """
    if not GOOGLE_PLACES_API_KEY:
        return ([], 0, "no_api_key")

    cache_key = "textsearch:" + hashlib.sha256((query + "|" + (region or "")).encode("utf-8")).hexdigest()
    cached = _places_cache_get(cache_key)
    if isinstance(cached, dict) and isinstance(cached.get("items"), list):
        return (cached["items"], 0, "cache_hit")

    # Global daily cap (optional)
    if MAX_DAILY_PLACES_CALLS and not _daily_consume("places_calls", 1):
        return ([], 0, "daily_cap")

    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {"query": query, "key": GOOGLE_PLACES_API_KEY}
    if region:
        params["region"] = region

    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    payload = r.json() or {}
    results = (payload.get("results") or [])[:12]

    items: List[Dict[str, Any]] = []
    for it in results:
        items.append(
            {
                "name": it.get("name"),
                "rating": it.get("rating"),
                "user_ratings_total": it.get("user_ratings_total"),
                # Do not store place_id here in V16 to reduce redistrib risk
                "types": it.get("types") if isinstance(it.get("types"), list) else [],
            }
        )

    _places_cache_set(cache_key, {"items": items, "status": payload.get("status")}, PLACES_CACHE_TTL_SECONDS)
    return (items, 1, str(payload.get("status") or ""))


def _compute_benchmarks(competitors: List[Dict[str, Any]]) -> Dict[str, Any]:
    ratings = [float(c.get("rating")) for c in competitors if isinstance(c.get("rating"), (int, float))]
    reviews = [int(c.get("user_ratings_total")) for c in competitors if isinstance(c.get("user_ratings_total"), int)]
    avg_rating = round(sum(ratings) / max(1, len(ratings)), 2) if ratings else 0.0
    avg_reviews = int(sum(reviews) / max(1, len(reviews))) if reviews else 0
    return {"avg_rating": avg_rating, "avg_reviews": avg_reviews, "competitors_found": len(competitors)}


def _opportunity_label(competitors_count: int, avg_rating: float, avg_reviews: int) -> str:
    """Deterministic opportunity classification.

    Lower competitor density + lower barrier (avg reviews) -> higher opportunity.
    Rating is used as a soft proxy for market quality.
    """
    # Competition pressure: 0..100 (higher = more pressure)
    pressure = min(100, competitors_count * 7)
    # Barrier: average reviews indicates entrenched players
    barrier = min(100, int(avg_reviews / 4))  # 400 => 100
    # Quality (soft): higher ratings suggests quality expectations
    quality = min(100, int(avg_rating * 20))
    score = 100 - int(round((pressure * 0.55) + (barrier * 0.35) + (quality * 0.10)))
    if score >= 60:
        return "Alta"
    if score >= 35:
        return "Média"
    return "Baixa"


def _build_opportunity_map(
    base_query: str,
    base_competitors: List[Dict[str, Any]],
    location: str,
    keywords: str,
    business: str,
    remaining_places_calls: int,
) -> Tuple[Dict[str, Any], int]:
    """Builds "Mapa de Oportunidade Local" with minimal extra Places calls.

    Strategy:
    - Always include the base area row (the original query).
    - If we have budget, try up to 2 additional micro-regions by appending: "Centro", "Zona Norte", "Zona Sul".
    - Everything is deterministic from Places stats.

    Returns: (block_json, additional_calls_used)
    """

    def _row(label: str, competitors: List[Dict[str, Any]]) -> Dict[str, Any]:
        b = _compute_benchmarks(competitors)
        opp = _opportunity_label(int(b.get("competitors_found") or 0), float(b.get("avg_rating") or 0), int(b.get("avg_reviews") or 0))
        return {
            "region": label,
            "competitors": int(b.get("competitors_found") or 0),
            "avg_rating": float(b.get("avg_rating") or 0),
            "avg_reviews": int(b.get("avg_reviews") or 0),
            "opportunity": opp,
        }

    rows: List[Dict[str, Any]] = []
    # Base row
    base_label = (location or "Área analisada").strip() or "Área analisada"
    rows.append(_row(base_label, base_competitors))

    calls_used = 0
    micro_labels = ["Centro", "Zona Norte", "Zona Sul"]

    # Only try micro-regions if we have any location hint
    if remaining_places_calls > 0 and (location or keywords or business):
        # Keep it cheap: max 2 extra calls
        max_extra = min(2, remaining_places_calls)
        for lab in micro_labels:
            if calls_used >= max_extra:
                break
            # Micro query: prefer keyword/service + location + label
            base = (keywords or business or "").strip()
            micro_q = " ".join([base, location, lab]).strip() or (base_query + " " + lab).strip()
            if not micro_q:
                continue
            items, calls, _status = _places_text_search(micro_q, region="")
            calls_used += int(calls)
            rows.append(_row(lab, items[:12]))

    # Decide best region (highest opportunity then lowest competitors)
    def _rank_key(r: Dict[str, Any]):
        opp = str(r.get("opportunity") or "Baixa")
        opp_w = {"Alta": 3, "Média": 2, "Baixa": 1}.get(opp, 1)
        return (-opp_w, int(r.get("competitors") or 0), -int(r.get("avg_reviews") or 0))

    best = sorted(rows, key=_rank_key)[0] if rows else None
    insight = ""
    if best:
        insight = (
            f"{best.get('region')} apresenta menor pressão competitiva "
            f"({best.get('competitors')} concorrentes) e barreira de entrada mais baixa "
            f"(média {best.get('avg_reviews')} reviews)."
        )

    return (
        {
            "rows": rows,
            "insight": insight,
            "notes": "Classificação baseada em densidade de concorrentes e prova social (reviews).",
        },
        calls_used,
    )


def _build_competitive_gap(competitors: List[Dict[str, Any]], bench: Dict[str, Any]) -> Dict[str, Any]:
    # top 3 by reviews
    top = sorted(
        [c for c in competitors if isinstance(c, dict)],
        key=lambda c: int(c.get("user_ratings_total") or 0),
        reverse=True,
    )[:3]
    top_avg_rating = 0.0
    top_avg_reviews = 0
    if top:
        rs = [float(c.get("rating") or 0) for c in top if isinstance(c.get("rating"), (int, float))]
        rv = [int(c.get("user_ratings_total") or 0) for c in top if isinstance(c.get("user_ratings_total"), int)]
        top_avg_rating = round(sum(rs) / max(1, len(rs)), 2) if rs else 0.0
        top_avg_reviews = int(sum(rv) / max(1, len(rv))) if rv else 0

    avg_rating = float(bench.get("avg_rating") or 0)
    avg_reviews = int(bench.get("avg_reviews") or 0)

    # Targets: conservative, no promises
    rating_target = round(min(5.0, max(avg_rating, top_avg_rating - 0.05)), 2) if (avg_rating or top_avg_rating) else 0.0
    # Round reviews to nearest 10
    reviews_target_raw = max(avg_reviews, int(top_avg_reviews * 0.70))
    reviews_target = int(round(reviews_target_raw / 10.0) * 10) if reviews_target_raw else 0

    table = [
        {"metric": "Rating", "market_avg": avg_rating, "top_competitors": top_avg_rating},
        {"metric": "Reviews", "market_avg": avg_reviews, "top_competitors": top_avg_reviews},
    ]
    insight = ""
    if rating_target or reviews_target:
        insight = f"Para competir, mire em rating mínimo ≈ {rating_target} e reviews alvo ≈ {reviews_target}."

    return {
        "table": table,
        "top_competitors": [
            {"name": c.get("name"), "rating": c.get("rating"), "user_ratings_total": c.get("user_ratings_total")} for c in top
        ],
        "targets": {"rating_min": rating_target, "reviews_target": reviews_target},
        "insight": insight,
    }


def _build_acquisition_strategy(context: Dict[str, Any], bench: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic marketing channel heuristic."""
    q = (context.get("query") or "").lower()
    business = (context.get("business") or "").lower()
    keywords = (context.get("keywords") or "").lower()
    comp = int(bench.get("competitors_found") or 0)

    is_visual = any(k in (keywords + " " + business + " " + q) for k in [
        "estética", "barbear", "barbearia", "restaurante", "café", "cafe", "padaria", "pizzaria", "academia", "moda", "salão", "salao", "fotografia", "personal",
    ])

    # High intent proxy: service keywords present and not only brand name
    high_intent = bool(keywords.strip()) or any(x in q for x in ["perto", "próximo", "proximo", "24h", "urgência", "urgencia", "preço", "preco", "orçamento", "orcamento", "melhor"])

    rows: List[Dict[str, Any]] = []

    maps_priority = "Alta" if comp >= 6 else "Média"
    rows.append({"channel": "SEO local / Google Maps", "priority": maps_priority, "reason": "Decisão local é fortemente influenciada por Maps, reviews e prova social."})

    ga_priority = "Alta" if high_intent else "Média"
    rows.append({"channel": "Google Ads", "priority": ga_priority, "reason": "Capta demanda de alta intenção quando o cliente pesquisa ativamente."})

    ig_priority = "Média" if is_visual else "Baixa"
    rows.append({"channel": "Instagram Ads", "priority": ig_priority, "reason": "Bom para awareness e prova visual; converte melhor quando há oferta clara."})

    fb_priority = "Média" if is_visual or comp >= 8 else "Baixa"
    rows.append({"channel": "Facebook Ads", "priority": fb_priority, "reason": "Alcance local amplo e segmentação; útil para remarketing e ofertas."})

    tt_priority = "Média" if is_visual else "Baixa"
    rows.append({"channel": "TikTok Ads", "priority": tt_priority, "reason": "Funciona melhor para nichos visuais; mais topo de funil."})

    return {"rows": rows}


def _build_investment_estimate(bench: Dict[str, Any]) -> Dict[str, Any]:
    comp = int(bench.get("competitors_found") or 0)
    avg_reviews = int(bench.get("avg_reviews") or 0)

    if comp >= 12 or avg_reviews >= 250:
        intensity = "Alta"
    elif comp >= 6 or avg_reviews >= 120:
        intensity = "Média"
    else:
        intensity = "Baixa"

    mult = {"Baixa": 1.0, "Média": 1.25, "Alta": 1.5}[intensity]
    reviews_target = int(round(max(30, avg_reviews) * mult / 10.0) * 10)

    if intensity == "Baixa":
        budget = {"min": 150, "max": 300}
        months = {"min": 1, "max": 3}
    elif intensity == "Média":
        budget = {"min": 300, "max": 600}
        months = {"min": 3, "max": 6}
    else:
        budget = {"min": 600, "max": 1200}
        months = {"min": 6, "max": 12}

    return {
        "reviews_target": reviews_target,
        "marketing_budget_eur_month": budget,
        "time_to_compete_months": months,
        "competitive_intensity": intensity,
        "disclaimer": "Estimativas heurísticas (não são promessa de resultado financeiro).",
    }


def _score_breakdown(bench: Dict[str, Any]) -> Dict[str, Any]:
    """
    Heuristic scoring: keeps product consistent even if LLM fails.
    Produces 0-100 subscores and total.
    """
    comp = int(bench.get("competitors_found") or 0)
    avg_rating = float(bench.get("avg_rating") or 0)
    avg_reviews = int(bench.get("avg_reviews") or 0)

    # Competition saturation: more competitors => lower opportunity
    competition = max(0, 100 - min(100, comp * 6))
    # Demand proxy: more reviews in the area => higher demand
    demand = min(100, int(avg_reviews / 5))  # 500 reviews avg => 100
    # Reputation: rating proxy
    reputation = min(100, int(avg_rating * 20))  # 5.0 => 100
    # Visibility is unknown without GBP data; infer from comp size
    visibility = max(20, min(100, 70 - int(comp * 1.5)))

    total = int(round((competition * 0.30) + (demand * 0.25) + (reputation * 0.25) + (visibility * 0.20)))
    return {
        "total": max(0, min(100, total)),
        "competition": max(0, min(100, int(competition))),
        "demand": max(0, min(100, int(demand))),
        "reputation": max(0, min(100, int(reputation))),
        "visibility": max(0, min(100, int(visibility))),
        "drivers": [
            {"factor": "competitors_found", "value": comp},
            {"factor": "avg_rating_area", "value": avg_rating},
            {"factor": "avg_reviews_area", "value": avg_reviews},
        ],
    }


def _actions_templates() -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    actions_7 = [
        {"task": "Otimizar título, categorias e descrição do Google Business Profile", "eta_minutes": 45, "difficulty": "baixa", "impact": "alto"},
        {"task": "Adicionar 8–12 fotos reais (fachada, interior, equipe, produtos/serviços)", "eta_minutes": 60, "difficulty": "baixa", "impact": "alto"},
        {"task": "Responder as 10 últimas avaliações (positivas e negativas) com padrão profissional", "eta_minutes": 40, "difficulty": "baixa", "impact": "médio"},
        {"task": "Criar mensagem/script para pedir avaliações e enviar para 20 clientes", "eta_minutes": 30, "difficulty": "baixa", "impact": "alto"},
    ]
    actions_30 = [
        {"task": "Meta de 20 novas avaliações em 30 dias (com rotina semanal)", "eta_minutes": 30, "difficulty": "média", "impact": "alto"},
        {"task": "Publicar 2 posts semanais no GBP (promoções, novidades, prova social)", "eta_minutes": 60, "difficulty": "média", "impact": "médio"},
        {"task": "Revisar oferta e diferenciar com 1 nicho/serviço âncora + prova", "eta_minutes": 90, "difficulty": "média", "impact": "alto"},
        {"task": "Criar uma landing simples com CTA e WhatsApp/telefone rastreável", "eta_minutes": 120, "difficulty": "média", "impact": "alto"},
    ]
    return actions_7, actions_30


def _estimate_openai_cost_cents(tokens_used: int) -> int:
    return int(round((tokens_used / 1000.0) * OPENAI_COST_PER_1K_TOKENS_CENTS))


def _openai_json(context: Dict[str, Any], competitors: List[Dict[str, Any]], bench: Dict[str, Any], score_bd: Dict[str, Any], max_out: int) -> Tuple[Optional[Dict[str, Any]], int]:
    """
    Calls OpenAI Chat Completions and tries to parse a single JSON object from assistant content.
    Returns (report_json_or_none, tokens_used).
    """
    if not OPENAI_API_KEY:
        return (None, 0)

    system = {
        "role": "system",
        "content": (
            "Você é um estrategista de tráfego pago local (Google Ads e Instagram Ads). "
            "Responda SOMENTE com um JSON válido (sem markdown), seguindo o schema solicitado."
        ),
    }

    user = {
        "role": "user",
        "content": json.dumps(
            {
                "schema": {
                    "title": "string (ex.: Plano de Tráfego Pago Local para <negócio> em <cidade>)",
                    "score_total": "number(0-100)",
                    "score_breakdown": {
                        "competition": "0-100",
                        "demand": "0-100",
                        "reputation": "0-100",
                        "visibility": "0-100",
                        "drivers": "array"
                    },
                    "benchmarks": {"avg_rating": "number", "avg_reviews": "number", "competitors_found": "number"},
                    "local_competitors": "array(objects: name, rating, user_ratings_total) (top 8)",
                    "opportunity_map": "object(rows:[{region,competitors,avg_rating,avg_reviews,opportunity}], insight:string)",
                    "competitive_gap": "object(table:[{metric,market_avg,top_competitors}], targets:{rating_min,reviews_target}, insight:string)",
                    "acquisition_strategy": "object(rows:[{channel,priority,reason}])",
                    "investment_estimate": "object(reviews_target:number, marketing_budget_eur_month:{min,max}, time_to_compete_months:{min,max}, competitive_intensity:string)",
                    "ideal_regions": "array(objects: region, reason, budget_share_pct) (3-6)",
                    "google_ads_keywords": "array(12-20 strings) (alta intenção + local)",
                    "instagram_hashtags": "array(15-30 strings) (mistas: local + nicho)",
                    "campaign_structure_google_ads": "object(campaigns:[{name, ad_groups:[{name, intent}], keywords:[strings], landing_page_angle:string}])",
                    "budget_daily_eur": "object(min:number, max:number, split:{google_ads_pct:number, instagram_ads_pct:number})",
                    "insights": "array(5-8 strings, objetivas, com números quando possível)",
                    "risks": "array(3-5 strings)",
                    "opportunities": "array(4-6 strings)",
                    "actions_7_days": "array(objects: task, eta_minutes, difficulty, impact)",
                    "actions_30_days": "array(objects: task, eta_minutes, difficulty, impact)",
                    "next_steps": "array(3 strings)",
                },
                "context": context,
                "benchmarks": bench,
                "score_breakdown_seed": score_bd,
                "top_competitors": competitors[:8],
                "rules": [
                    "Não seja genérico. Use números do benchmark (médias, contagem de concorrentes) e traduza em decisões de anúncios (onde, como, quanto).",
                    "Não prometa resultados garantidos.",
                    "Os blocos opportunity_map/competitive_gap/acquisition_strategy/investment_estimate podem ser breves; não invente dados.",
                    "Escreva em português do Brasil.",
                ],
            },
            ensure_ascii=False,
        ),
    }

    body = {
        "model": OPENAI_MODEL,
        "messages": [system, user],
        "max_tokens": int(max_out),
        "temperature": 0.35,
    }

    r = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        timeout=75,
    )
    r.raise_for_status()
    data = r.json() or {}
    usage = data.get("usage") or {}
    tokens_used = int(usage.get("total_tokens") or 0)
    content = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content") or ""
    content = content.strip()

    # Try parse as JSON
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return (parsed, tokens_used)
    except Exception:
        # Try to extract first {...} block
        m1 = content.find("{")
        m2 = content.rfind("}")
        if m1 != -1 and m2 != -1 and m2 > m1:
            try:
                parsed = json.loads(content[m1:m2+1])
                if isinstance(parsed, dict):
                    return (parsed, tokens_used)
            except Exception:
                pass

    return (None, tokens_used)


def _fallback_report(context: Dict[str, Any], bench: Dict[str, Any], score_bd: Dict[str, Any]) -> Dict[str, Any]:
    a7, a30 = _actions_templates()
    # Minimal deterministic blocks (keeps report valuable even without LLM)
    opportunity_map, _calls = _build_opportunity_map(
        base_query=str(context.get("query") or ""),
        base_competitors=[],
        location=str(context.get("location") or ""),
        keywords=str(context.get("keywords") or ""),
        business=str(context.get("business") or ""),
        remaining_places_calls=0,
    )
    competitive_gap = _build_competitive_gap([], bench)
    acquisition_strategy = _build_acquisition_strategy(context, bench)
    investment_estimate = _build_investment_estimate(bench)
    return {
        "title": "Relatório de mercado local",
        "score_total": int(score_bd.get("total") or 0),
        "score_breakdown": score_bd,
        "benchmarks": bench,
        "local_competitors": [],
        "opportunity_map": opportunity_map,
        "competitive_gap": competitive_gap,
        "acquisition_strategy": acquisition_strategy,
        "investment_estimate": investment_estimate,
        "insights": [
            f"Foram encontrados {int(bench.get('competitors_found') or 0)} concorrentes relevantes na busca.",
            f"A média de avaliação na região é {float(bench.get('avg_rating') or 0):.2f} estrelas.",
            f"A média de volume de avaliações dos concorrentes é {int(bench.get('avg_reviews') or 0)} reviews.",
            "Quanto maior o volume de avaliações, maior a prova social percebida.",
            "Ações rápidas no Google Business Profile tendem a aumentar cliques e ligações.",
        ],
        "risks": [
            "Concorrência intensa pode exigir diferenciação clara de oferta.",
            "Pouca prova social (reviews) reduz conversão em Maps.",
            "Sem rotina de posts e fotos, o perfil perde relevância.",
        ],
        "opportunities": [
            "Aumentar prova social com rotina semanal de reviews.",
            "Melhorar qualidade e frequência de fotos reais.",
            "Construir oferta âncora e mensagens simples (promessa + prova).",
            "Criar CTA rastreável (WhatsApp/telefone) e medir conversões.",
        ],
        "actions_7_days": a7,
        "actions_30_days": a30,
        "next_steps": ["Executar o checklist de 7 dias", "Medir aumento de ligações/rotas", "Reavaliar em 30 dias"],
    }


def _build_report(context: Dict[str, Any], competitors: List[Dict[str, Any]], bench: Dict[str, Any], max_tokens: int, max_cost_cents: int) -> Tuple[Dict[str, Any], int, int]:
    score_bd = _score_breakdown(bench)

    # If OpenAI disabled or budgets too low, fallback
    if not OPENAI_API_KEY:
        rep = _fallback_report(context, bench, score_bd)
        return (rep, 0, 0)

    # Global daily cap (optional): consume estimated cents budget before calling
    # We'll call OpenAI, then record actual estimate based on tokens_used.
    # Pre-check: if cap enabled, ensure at least 1 cent remaining
    if MAX_DAILY_OPENAI_CENTS and not _daily_consume("openai_cents", 1):
        rep = _fallback_report(context, bench, score_bd)
        return (rep, 0, 0)

    # Call OpenAI
    report_json, tokens_used = _openai_json(context, competitors, bench, score_bd, max_tokens)
    est_cents = _estimate_openai_cost_cents(tokens_used)
    if tokens_used and MAX_DAILY_OPENAI_CENTS:
        # consume remaining after the pre-check
        extra = max(0, est_cents - 1)
        if extra:
            allowed = _daily_consume("openai_cents", extra)
            if not allowed:
                # Budget exceeded after the call: degrade content (still keep consistent)
                report_json = None

    # Enforce per-analysis max cost (best-effort)
    if est_cents > int(max_cost_cents or 0) and int(max_cost_cents or 0) > 0:
        report_json = None

    if not isinstance(report_json, dict):
        report_json = _fallback_report(context, bench, score_bd)

    # Deterministic blocks (low-cost) — always computed and injected
    local_competitors = [
        {"name": c.get("name"), "rating": c.get("rating"), "user_ratings_total": c.get("user_ratings_total")}
        for c in (competitors[:8] if isinstance(competitors, list) else [])
        if isinstance(c, dict)
    ]
    # Opportunity map: allow 0 extra calls here (worker already spent Places). Micro-regions handled in _process_job.
    # Placeholder injection will be overwritten when provided.
    report_json.setdefault("local_competitors", local_competitors)
    report_json.setdefault(
        "competitive_gap",
        _build_competitive_gap(competitors, bench),
    )
    report_json.setdefault(
        "acquisition_strategy",
        _build_acquisition_strategy(context, bench),
    )
    report_json.setdefault(
        "investment_estimate",
        _build_investment_estimate(bench),
    )

    # Ensure required keys exist
    a7, a30 = _actions_templates()
    report_json.setdefault("score_total", int(score_bd.get("total") or 0))
    report_json.setdefault("score_breakdown", score_bd)
    report_json.setdefault("benchmarks", bench)
    report_json.setdefault("actions_7_days", a7)
    report_json.setdefault("actions_30_days", a30)

    return (report_json, tokens_used, est_cents)


def _to_markdown(report_json: Dict[str, Any]) -> str:
    # Simple markdown renderer (safe, deterministic)
    title = report_json.get("title") or "Relatório de Tráfego Pago Local"
    s_total = report_json.get("score_total")
    bd = report_json.get("score_breakdown") or {}
    bench = report_json.get("benchmarks") or {}

    md = []
    md.append(f"# {title}")
    if isinstance(s_total, (int, float)):
        md.append(f"**Score geral:** {int(s_total)}/100")
    if isinstance(bd, dict):
        md.append("")
        md.append("## Score detalhado")
        for k in ["competition", "demand", "reputation", "visibility"]:
            if k in bd:
                md.append(f"- **{k}**: {int(bd.get(k) or 0)}/100")
    if isinstance(bench, dict):
        md.append("")
        md.append("## Benchmarks locais (Google Places)")
        md.append(f"- Concorrentes encontrados: {int(bench.get('competitors_found') or 0)}")
        md.append(f"- Média de rating: {float(bench.get('avg_rating') or 0):.2f}")
        md.append(f"- Média de reviews: {int(bench.get('avg_reviews') or 0)}")

    def _list(title: str, key: str):
        arr = report_json.get(key)
        if isinstance(arr, list) and arr:
            md.append("")
            md.append(f"## {title}")
            for it in arr:
                if isinstance(it, dict) and "task" in it:
                    md.append(f"- {it.get('task')} (ETA {it.get('eta_minutes','?')} min, impacto {it.get('impact','?')})")
                else:
                    md.append(f"- {str(it)}")

    # Order (V17)
    _list("Insights objetivos", "insights")

    # Concorrentes locais
    lc = report_json.get("local_competitors")
    if isinstance(lc, list) and lc:
        md.append("")
        md.append("## Concorrentes locais (top)")
        for c in lc[:8]:
            if isinstance(c, dict):
                md.append(f"- {c.get('name','—')} — {c.get('rating','?')}⭐ — {c.get('user_ratings_total','?')} reviews")

    # Bloco 1 — Mapa de Oportunidade
    om = report_json.get("opportunity_map")
    if isinstance(om, dict):
        rows = om.get("rows")
        if isinstance(rows, list) and rows:
            md.append("")
            md.append("## Mapa de oportunidade local")
            for r in rows:
                if isinstance(r, dict):
                    md.append(
                        f"- {r.get('region','—')} — {r.get('competitors','?')} concorrentes — "
                        f"rating médio {r.get('avg_rating','?')} — reviews médios {r.get('avg_reviews','?')} — "
                        f"oportunidade {r.get('opportunity','?')}"
                    )
            if om.get("insight"):
                md.append(f"\n**Insight:** {om.get('insight')}")

    # Bloco 2 — Gap competitivo
    cg = report_json.get("competitive_gap")
    if isinstance(cg, dict):
        md.append("")
        md.append("## Gap competitivo")
        table = cg.get("table")
        if isinstance(table, list):
            for r in table:
                if isinstance(r, dict):
                    md.append(f"- {r.get('metric')}: média mercado {r.get('market_avg')} | top concorrentes {r.get('top_competitors')}")
        if cg.get("insight"):
            md.append(f"\n**Insight:** {cg.get('insight')}")

    # Bloco 3 — Estratégia de tráfego pago
    acq = report_json.get("acquisition_strategy")
    if isinstance(acq, dict):
        rows = acq.get("rows")
        if isinstance(rows, list) and rows:
            md.append("")
            md.append("## Estratégia de tráfego pago")
            for r in rows:
                if isinstance(r, dict):
                    md.append(f"- {r.get('channel')}: prioridade {r.get('priority')} — {r.get('reason')}")

    # Bloco 4 — Estimativa de investimento
    inv = report_json.get("investment_estimate")
    if isinstance(inv, dict):
        md.append("")
        md.append("## Orçamento recomendado (tráfego pago)")
        md.append(f"- Reviews alvo: {inv.get('reviews_target','?')}+")
        b = inv.get("marketing_budget_eur_month") or {}
        t = inv.get("time_to_compete_months") or {}
        md.append(f"- Investimento marketing estimado: €{b.get('min','?')}–€{b.get('max','?')}/mês")
        md.append(f"- Tempo estimado para competir: {t.get('min','?')}–{t.get('max','?')} meses")
        if inv.get("disclaimer"):
            md.append(f"\n*{inv.get('disclaimer')}*")

    # Existing blocks (order required)
    _list("Oportunidades", "opportunities")
    _list("Riscos", "risks")
    _list("Plano de ação — 7 dias", "actions_7_days")
    _list("Plano de ação — 30 dias", "actions_30_days")
    _list("Próximos passos", "next_steps")

    return "\n".join(md).strip() + "\n"


class Heartbeat(Thread):
    def __init__(self, stop: Event, job_id: str):
        super().__init__(daemon=True)
        self.stop = stop
        self.job_id = job_id

    def run(self) -> None:
        while not self.stop.is_set():
            try:
                _post("/api/worker/heartbeat", {"job_id": self.job_id, "owner": LOCK_OWNER}, timeout=20)
            except Exception:
                pass
            self.stop.wait(HEARTBEAT_SECONDS)


def _process_job(job: Dict[str, Any]) -> None:
    job_id = job.get("id")
    analysis_id = job.get("analysis_id")
    if not job_id or not analysis_id:
        return

    stop = Event()
    hb = Heartbeat(stop, job_id)
    hb.start()

    try:
        r = _post(f"/api/worker/analysis/{analysis_id}", {}, timeout=25)
        if r.status_code != 200:
            _post("/api/worker/complete", {"job_id": job_id, "status": "failed", "error": "analysis_fetch_failed"}, timeout=25)
            return
        analysis = (r.json() or {}).get("analysis") or {}
        inputv = analysis.get("input") or {}

        # Per-analysis caps
        max_cost_cents = int(analysis.get("max_cost_cents") or MAX_OPENAI_COST_CENTS_DEFAULT)
        max_places_calls = int(analysis.get("max_places_calls") or MAX_PLACES_CALLS_DEFAULT)
        max_openai_tokens = int(analysis.get("max_openai_tokens") or MAX_OPENAI_TOKENS_DEFAULT)

        query = (inputv.get("query") or "").strip()
        business = (inputv.get("business") or "").strip()
        location = (inputv.get("location") or "").strip()
        keywords = (inputv.get("keywords") or "").strip()

        q = query or " ".join([business, keywords, location]).strip()
        if not q:
            _post("/api/worker/complete", {"job_id": job_id, "status": "failed", "error": "missing_query"}, timeout=25)
            return

        context = {"query": q, "business": business, "location": location, "keywords": keywords}

        competitors: List[Dict[str, Any]] = []
        places_calls = 0
        if max_places_calls > 0:
            items, calls, status = _places_text_search(q, region="")
            competitors = items[: max(0, min(12, max_places_calls * 3))]
            places_calls = int(calls)

        bench = _compute_benchmarks(competitors)

        # New blocks (V17) — keep Places cost low: only use remaining call budget
        remaining_calls = max(0, int(max_places_calls) - int(places_calls))
        opportunity_map, extra_calls = _build_opportunity_map(
            base_query=q,
            base_competitors=competitors,
            location=location,
            keywords=keywords,
            business=business,
            remaining_places_calls=remaining_calls,
        )
        places_calls += int(extra_calls)

        report_json, tokens_used, est_cents = _build_report(context, competitors, bench, max_openai_tokens, max_cost_cents)
        # Ensure deterministic blocks are present and ordered
        report_json["opportunity_map"] = opportunity_map
        report_md = _to_markdown(report_json)

        # A compact summary for list/status
        summary = ""
        insights = report_json.get("insights")
        if isinstance(insights, list) and insights:
            summary = str(insights[0])[:240]
        score_total = int(report_json.get("score_total") or 0)

        payload = {
            "job_id": job_id,
            "status": "ready",
            "result": {
                "score": score_total,
                "summary": summary,
                "recommendations": report_json.get("opportunities") if isinstance(report_json.get("opportunities"), list) else [],
                "report_json": report_json,
                "report_md": report_md,
                "competitors": competitors,  # minimized fields only
                "sources": {"places": True, "openai": bool(OPENAI_API_KEY)},
                "openai_tokens_used": int(tokens_used),
                "places_calls": int(places_calls),
                "cost_cents_estimate": int(est_cents),
            },
        }

        _post("/api/worker/complete", payload, timeout=40)
    except Exception as e:
        try:
            _post("/api/worker/complete", {"job_id": job_id, "status": "failed", "error": str(e)[:200]}, timeout=25)
        except Exception:
            pass
    finally:
        stop.set()


def main() -> None:
    if not WORKER_SECRET:
        raise SystemExit("Missing WORKER_SECRET")
    print(f"[worker] V17 starting — base={API_BASE} owner={LOCK_OWNER}")
    while True:
        try:
            r = _post("/api/worker/claim", {"owner": LOCK_OWNER}, timeout=25)
            if r.status_code != 200:
                time.sleep(CLAIM_SLEEP_SECONDS)
                continue
            data = r.json() or {}
            job = data.get("job")
            if not job:
                time.sleep(CLAIM_SLEEP_SECONDS)
                continue
            _process_job(job)
        except KeyboardInterrupt:
            raise
        except Exception:
            time.sleep(CLAIM_SLEEP_SECONDS)


if __name__ == "__main__":
    main()
