import os
import re
import json
import logging
from typing import Optional, Dict, Any, List
import httpx

from app.core.config import PROVIDER_ENV_KEYS, IS_PROD

logger = logging.getLogger(__name__)

DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

class LLMProviderError(Exception):
    """Custom exception for LLM provider errors."""
    pass

async def get_ollama_models(base_url: str = DEFAULT_OLLAMA_URL) -> List[str]:
    """Fetch all locally installed models from Ollama."""
    url = f"{base_url.rstrip('/')}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                return models
    except Exception as e:
        logger.debug(f"Could not connect to Ollama at {url}: {e}")
    return []

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

PRESET_MODELS: Dict[str, List[Dict[str, str]]] = {
    "gemini": [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash (Fast & Recommended)"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro (Deep Research & Reasoning)"},
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash (Next-Gen Production)"},
        {"id": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash-Lite (Ultra-Fast)"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash (Legacy)"},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro (Legacy)"},
    ],
    "openai": [
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini (Fast & Cost-Effective)"},
        {"id": "gpt-4o", "name": "GPT-4o (Flagship Multimodal)"},
        {"id": "o3-mini", "name": "o3-mini (STEM & Math Reasoning)"},
        {"id": "o1", "name": "o1 (Advanced Deep Reasoning)"},
        {"id": "o1-mini", "name": "o1-mini (Fast Reasoning)"},
    ],
    "anthropic": [
        {"id": "claude-3-5-sonnet-latest", "name": "Claude 3.5 Sonnet (Latest / SOTA)"},
        {"id": "claude-3-5-haiku-latest", "name": "Claude 3.5 Haiku (Fast & Lean)"},
        {"id": "claude-3-7-sonnet-20250219", "name": "Claude 3.7 Sonnet (Hybrid Reasoning)"},
        {"id": "claude-sonnet-5", "name": "Claude Sonnet 5 (Frontier)"},
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet (Legacy Oct 2024)"},
        {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku (Legacy Oct 2024)"},
    ],
    "groq": [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B (Ultra-Fast & Versatile)"},
        {"id": "deepseek-r1-distill-llama-70b", "name": "DeepSeek R1 Distill 70B (Fast Reasoning)"},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B Instant (Instant Response)"},
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B (Large Context)"},
    ],
    "deepseek": [
        {"id": "deepseek-chat", "name": "DeepSeek-V3 (Chat & Academic QA)"},
        {"id": "deepseek-reasoner", "name": "DeepSeek-R1 (Chain-of-Thought Reasoning)"},
    ],
}

async def fetch_provider_models(
    provider: str,
    api_key: Optional[str] = None,
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> Dict[str, Any]:
    """Fetch live models directly from provider API, falling back to rich presets."""
    provider = provider.lower()
    presets = PRESET_MODELS.get(provider, [])

    if provider == "ollama":
        models = await get_ollama_models(ollama_url)
        items = [{"id": m, "name": m} for m in models] if models else presets
        return {
            "success": bool(models),
            "provider": "ollama",
            "models": items,
            "message": f"Found {len(items)} local Ollama model(s)." if models else "No Ollama models detected. Is Ollama running?",
        }

    key = api_key
    if not key:
        env_var = PROVIDER_ENV_KEYS.get(provider)
        if env_var and os.getenv(env_var):
            key = os.getenv(env_var)

    if not key:
        return {
            "success": True,
            "provider": provider,
            "models": presets,
            "message": "Enter your API key to fetch live models authorized for your account.",
        }

    try:
        if provider == "gemini":
            for ver in ["v1beta", "v1"]:
                url = f"https://generativelanguage.googleapis.com/{ver}/models?key={key}"
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_models = data.get("models", [])
                        live_items = []
                        for m in raw_models:
                            if "generateContent" in m.get("supportedGenerationMethods", []):
                                mid = m.get("name", "").removeprefix("models/")
                                dname = m.get("displayName") or mid
                                live_items.append({"id": mid, "name": f"{dname} ({mid})"})
                        if live_items:
                            def gemini_sort_key(item: Dict[str, str]) -> int:
                                i = item["id"].lower()
                                if "2.5-flash" in i: return 0
                                if "2.5-pro" in i: return 1
                                if "2.0-flash" in i: return 2
                                if "flash" in i: return 3
                                if "pro" in i: return 4
                                return 10
                            live_items.sort(key=gemini_sort_key)
                            return {
                                "success": True,
                                "provider": "gemini",
                                "models": live_items,
                                "message": f"Retrieved {len(live_items)} live Gemini models from Google AI Studio.",
                            }

        elif provider == "openai":
            url = "https://api.openai.com/v1/models"
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers={"Authorization": f"Bearer {key}"})
                if resp.status_code == 200:
                    data = resp.json()
                    raw_models = data.get("data", [])
                    live_items = []
                    for m in raw_models:
                        mid = m.get("id", "")
                        if any(mid.startswith(p) for p in ("gpt-4", "gpt-3.5", "o1", "o3", "chatgpt")):
                            if not any(x in mid for x in ("realtime", "audio", "transcription", "tts", "moderation", "embedding")):
                                live_items.append({"id": mid, "name": mid})
                    if live_items:
                        def openai_sort_key(item: Dict[str, str]) -> int:
                            i = item["id"].lower()
                            if i == "gpt-4o-mini": return 0
                            if i == "gpt-4o": return 1
                            if "o3-mini" in i: return 2
                            if i == "o1": return 3
                            if "o1-mini" in i: return 4
                            return 10
                        live_items.sort(key=openai_sort_key)
                        return {
                            "success": True,
                            "provider": "openai",
                            "models": live_items,
                            "message": f"Retrieved {len(live_items)} live OpenAI models.",
                        }

        elif provider == "anthropic":
            url = "https://api.anthropic.com/v1/models"
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    url,
                    headers={
                        "x-api-key": key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw_models = data.get("data", [])
                    live_items = []
                    for m in raw_models:
                        mid = m.get("id", "")
                        dname = m.get("display_name", mid)
                        live_items.append({"id": mid, "name": f"{dname} ({mid})"})
                    if live_items:
                        return {
                            "success": True,
                            "provider": "anthropic",
                            "models": live_items,
                            "message": f"Retrieved {len(live_items)} live Anthropic Claude models.",
                        }

        elif provider == "groq":
            url = "https://api.groq.com/openai/v1/models"
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers={"Authorization": f"Bearer {key}"})
                if resp.status_code == 200:
                    data = resp.json()
                    raw_models = data.get("data", [])
                    live_items = []
                    for m in raw_models:
                        if m.get("active", True):
                            mid = m.get("id", "")
                            live_items.append({"id": mid, "name": mid})
                    if live_items:
                        return {
                            "success": True,
                            "provider": "groq",
                            "models": live_items,
                            "message": f"Retrieved {len(live_items)} live Groq models.",
                        }

        elif provider == "deepseek":
            url = "https://api.deepseek.com/models"
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers={"Authorization": f"Bearer {key}"})
                if resp.status_code == 200:
                    data = resp.json()
                    raw_models = data.get("data", [])
                    live_items = [{"id": m.get("id"), "name": m.get("id")} for m in raw_models if m.get("id")]
                    if live_items:
                        return {
                            "success": True,
                            "provider": "deepseek",
                            "models": live_items,
                            "message": f"Retrieved {len(live_items)} live DeepSeek models.",
                        }
    except Exception as e:
        logger.debug(f"Failed to fetch live models for {provider}: {e}")

    return {
        "success": True,
        "provider": provider,
        "models": presets,
        "message": f"Using current {provider.capitalize()} model presets.",
    }

async def test_llm_connection(
    provider: str,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> Dict[str, Any]:
    """Quick test to verify that the provider and key/server are operational."""
    provider = provider.lower()

    if provider == "ollama":
        url = f"{ollama_url.rstrip('/')}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                    return {
                        "success": True,
                        "provider": "ollama",
                        "message": f"Connected to Ollama. {len(models)} model(s) available.",
                        "models": models,
                    }
                return {
                    "success": False,
                    "provider": "ollama",
                    "message": f"Ollama returned HTTP {resp.status_code}",
                }
        except Exception as e:
            return {
                "success": False,
                "provider": "ollama",
                "message": f"Cannot connect to Ollama at {ollama_url}. Is Ollama running? ({str(e)})",
            }

    key_source = "request"
    if not api_key:
        env_var = PROVIDER_ENV_KEYS.get(provider)
        if env_var and os.getenv(env_var):
            api_key = os.getenv(env_var)
            key_source = f"env ({env_var})"

    if not api_key:
        env_var = PROVIDER_ENV_KEYS.get(provider, "API_KEY")
        return {
            "success": False,
            "provider": provider,
            "message": f"{provider.capitalize()} API key is required. Enter it in settings or configure {env_var} in backend/.env.",
        }

    if provider == "gemini":
        model_name = (model or DEFAULT_GEMINI_MODEL).strip().removeprefix("models/")
        available_models: List[str] = []
        last_error = None

        # 1. Attempt to fetch available models for this key
        try:
            for ver in ["v1beta", "v1"]:
                list_url = f"https://generativelanguage.googleapis.com/{ver}/models?key={api_key}"
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.get(list_url)
                    if resp.status_code == 200:
                        m_data = resp.json().get("models", [])
                        available_models = [
                            m["name"].removeprefix("models/")
                            for m in m_data
                            if "generateContent" in m.get("supportedGenerationMethods", [])
                        ]
                        if available_models:
                            break
        except Exception:
            pass

        # 2. Test generateContent with model_name across v1beta and v1
        for ver in ["v1beta", "v1"]:
            url = f"https://generativelanguage.googleapis.com/{ver}/models/{model_name}:generateContent?key={api_key}"
            try:
                # Pro/reasoning models require sufficient token budget for thought tokens
                test_tokens = 800 if "pro" in model_name.lower() else 50
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        url,
                        json={
                            "contents": [{"parts": [{"text": "Hello, respond with 'OK'."}]}],
                            "generationConfig": {"maxOutputTokens": test_tokens},
                        },
                    )
                    if resp.status_code == 200:
                        return {
                            "success": True,
                            "provider": "gemini",
                            "message": f"Gemini API key is valid and verified with model '{model_name}'! (Key source: {key_source})",
                            "key_source": key_source,
                            "models": available_models or [m["id"] for m in PRESET_MODELS["gemini"]],
                        }
                    err_body = resp.json()
                    last_error = err_body.get("error", {}).get("message", f"HTTP {resp.status_code}")
                    # If error is not a 404 version mismatch, do not overwrite last_error with v1's 404
                    if resp.status_code != 404:
                        break
            except Exception as e:
                last_error = str(e)
                break

        # 3. Handle model failure gracefully
        if available_models:
            if model_name in available_models:
                return {
                    "success": False,
                    "provider": "gemini",
                    "message": f"Your key has access to '{model_name}', but the test request failed: {last_error}",
                    "models": available_models,
                }
            else:
                first_good = next(
                    (m for m in available_models if "2.5-flash" in m or "2.0-flash" in m or "flash" in m),
                    available_models[0],
                )
                return {
                    "success": False,
                    "provider": "gemini",
                    "message": f"Your key is VALID! However, '{model_name}' is not supported by your key/project. Supported models: {', '.join(available_models[:4])}. Please select '{first_good}'.",
                    "models": available_models,
                }

        return {"success": False, "provider": "gemini", "message": f"Gemini error: {last_error}"}

    elif provider == "anthropic":
        test_model = (model or "claude-3-5-sonnet-latest").strip()
        url = "https://api.anthropic.com/v1/messages"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": test_model,
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": "Hi"}],
                    },
                )
                if resp.status_code == 200:
                    models_res = await fetch_provider_models("anthropic", api_key)
                    model_ids = [m["id"] for m in models_res.get("models", [])]
                    return {
                        "success": True,
                        "provider": "anthropic",
                        "message": f"Anthropic Claude API key is valid with model '{test_model}'! (Key source: {key_source})",
                        "key_source": key_source,
                        "models": model_ids,
                    }
                err_body = resp.json()
                err_msg = err_body.get("error", {}).get("message", f"HTTP {resp.status_code}")
                return {"success": False, "provider": "anthropic", "message": f"Anthropic error: {err_msg}"}
        except Exception as e:
            return {"success": False, "provider": "anthropic", "message": f"Anthropic connection failed: {str(e)}"}

    elif provider in ("openai", "groq", "deepseek"):
        if provider == "openai":
            base_url = "https://api.openai.com/v1"
            test_model = (model or "gpt-4o-mini").strip()
        elif provider == "groq":
            base_url = "https://api.groq.com/openai/v1"
            test_model = (model or "llama-3.3-70b-versatile").strip()
        else:  # deepseek
            base_url = "https://api.deepseek.com"
            test_model = (model or "deepseek-chat").strip()

        url = f"{base_url}/chat/completions"
        try:
            body: Dict[str, Any] = {
                "model": test_model,
                "messages": [{"role": "user", "content": "Hi"}],
            }
            if test_model.startswith(("o1", "o3")):
                body["max_completion_tokens"] = 10
            else:
                body["max_tokens"] = 10

            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=body,
                )
                if resp.status_code == 200:
                    models_res = await fetch_provider_models(provider, api_key)
                    model_ids = [m["id"] for m in models_res.get("models", [])]
                    return {
                        "success": True,
                        "provider": provider,
                        "message": f"{provider.capitalize()} API key is valid with model '{test_model}'! (Key source: {key_source})",
                        "key_source": key_source,
                        "models": model_ids,
                    }
                err_body = resp.json()
                err_msg = err_body.get("error", {}).get("message", f"HTTP {resp.status_code}")
                return {"success": False, "provider": provider, "message": f"{provider.capitalize()} error: {err_msg}"}
        except Exception as e:
            return {"success": False, "provider": provider, "message": f"{provider.capitalize()} connection failed: {str(e)}"}

    return {"success": False, "provider": provider, "message": f"Unknown provider: {provider}"}

async def generate_completion(
    prompt: str,
    system_prompt: Optional[str] = None,
    provider: str = "ollama",
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    ollama_url: str = DEFAULT_OLLAMA_URL,
    temperature: float = 0.3,
    max_tokens: int = 1500,
) -> str:
    """
    Unified text completion generator across Local Ollama, Gemini, OpenAI, Claude, Groq, and DeepSeek.
    """
    provider = (provider or ("gemini" if IS_PROD else "ollama")).lower()

    if provider == "ollama":
        raw = await _generate_ollama(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            ollama_url=ollama_url,
            temperature=temperature,
        )

    elif provider == "gemini":
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            raise LLMProviderError(
                "Gemini API key is required in production mode. Please enter your API key in AI Settings (gear icon) or configure GEMINI_API_KEY in backend/.env."
            )
        raw = await _generate_gemini(
            prompt=prompt,
            system_prompt=system_prompt,
            api_key=key,
            model=model or DEFAULT_GEMINI_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    elif provider == "anthropic":
        key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not key:
            raise LLMProviderError(
                "Anthropic Claude API key is required in production mode. Please enter your API key in AI Settings (gear icon) or configure ANTHROPIC_API_KEY in backend/.env."
            )
        raw = await _generate_anthropic(
            prompt=prompt,
            system_prompt=system_prompt,
            api_key=key,
            model=model or "claude-3-5-sonnet-latest",
            temperature=temperature,
            max_tokens=max_tokens,
        )

    elif provider in ("openai", "groq", "deepseek"):
        env_var = PROVIDER_ENV_KEYS.get(provider, "OPENAI_API_KEY")
        key = api_key or os.getenv(env_var)
        if not key:
            raise LLMProviderError(
                f"{provider.capitalize()} API key is required in production mode. Please enter your API key in AI Settings (gear icon) or configure {env_var} in backend/.env."
            )
        raw = await _generate_openai_compatible(
            prompt=prompt,
            system_prompt=system_prompt,
            provider=provider,
            api_key=key,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    else:
        raise LLMProviderError(f"Unsupported AI provider: {provider}")

    return strip_unwanted_markdown_fences(raw)

def strip_unwanted_markdown_fences(text: str) -> str:
    """
    Strips accidental ```markdown ... ``` or ``` ... ``` wrappers that local models
    like Ollama sometimes enclose their entire response with.
    """
    if not text:
        return ""
    stripped = text.strip()

    # Match ```markdown ... ```
    match = re.match(r"^```(?:markdown|md)?\s*\n([\s\S]*?)\n```(?:\s*\n\s*[\s\S]*)?$", stripped, re.IGNORECASE)
    if match:
        inner = match.group(1).strip()
        trailing = re.sub(r"^```(?:markdown|md)?\s*\n[\s\S]*?\n```\s*", "", stripped, flags=re.IGNORECASE).strip()
        if trailing:
            return f"{inner}\n\n{trailing}"
        return inner
    return stripped

async def _generate_ollama(
    prompt: str,
    system_prompt: Optional[str],
    model: Optional[str],
    ollama_url: str,
    temperature: float,
) -> str:
    """Generate response via Ollama REST API (/api/chat)."""
    base_url = ollama_url.rstrip("/")
    model_name = model

    if not model_name:
        available = await get_ollama_models(base_url)
        if available:
            model_name = available[0]
        else:
            model_name = "mistral"

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model_name,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{base_url}/api/chat", json=payload)
            if resp.status_code != 200:
                raise LLMProviderError(f"Ollama error (HTTP {resp.status_code}): {resp.text}")
            data = resp.json()
            msg = data.get("message", {})
            return msg.get("content", "").strip()
    except httpx.ConnectError:
        raise LLMProviderError(
            f"Cannot connect to local Ollama at {base_url}. Make sure Ollama is running (`ollama serve`)."
        )
    except Exception as e:
        raise LLMProviderError(f"Ollama invocation error: {str(e)}")

async def _generate_gemini(
    prompt: str,
    system_prompt: Optional[str],
    api_key: Optional[str],
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Generate response via Google Gemini REST API with dual v1beta/v1 endpoint fallback."""
    if not api_key:
        raise LLMProviderError(
            "Gemini API Key is missing. Enter your key in the AI Settings (BYOK) or set GEMINI_API_KEY."
        )

    clean_model = (model or DEFAULT_GEMINI_MODEL).strip().removeprefix("models/")

    output_tokens = max(max_tokens, 2048) if "pro" in clean_model.lower() else max_tokens

    body: Dict[str, Any] = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": output_tokens,
        },
    }

    if system_prompt:
        body["systemInstruction"] = {
            "parts": [{"text": system_prompt}]
        }

    last_err = "No response from Gemini API"
    for api_version in ["v1beta", "v1"]:
        url = f"https://generativelanguage.googleapis.com/{api_version}/models/{clean_model}:generateContent?key={api_key}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise LLMProviderError("Gemini returned an empty candidate list.")

                    content = candidates[0].get("content", {})
                    parts = content.get("parts", [])
                    text_result = "".join(p.get("text", "") for p in parts)
                    return text_result.strip()

                err_data = resp.json()
                last_err = err_data.get("error", {}).get("message", resp.text)
                # If not 404, the version isn't the problem (e.g. auth or quota error), so break early
                if resp.status_code != 404:
                    break
        except LLMProviderError:
            raise
        except Exception as e:
            last_err = str(e)
            break

    raise LLMProviderError(f"Gemini API error: {last_err}")

async def _generate_anthropic(
    prompt: str,
    system_prompt: Optional[str],
    api_key: Optional[str],
    model: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """Generate response via Anthropic Claude Messages API."""
    if not api_key:
        raise LLMProviderError(
            "Anthropic API Key is missing. Enter your key in the AI Settings (BYOK)."
        )

    clean_model = (model or "claude-3-5-sonnet-latest").strip()
    url = "https://api.anthropic.com/v1/messages"
    body: Dict[str, Any] = {
        "model": clean_model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }

    if system_prompt:
        body["system"] = system_prompt

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
            if resp.status_code != 200:
                err_data = resp.json()
                err_msg = err_data.get("error", {}).get("message", resp.text)
                raise LLMProviderError(f"Anthropic error ({resp.status_code}): {err_msg}")

            data = resp.json()
            content_blocks = data.get("content", [])
            if not content_blocks:
                raise LLMProviderError("Anthropic returned empty content.")

            return "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text").strip()
    except LLMProviderError:
        raise
    except Exception as e:
        raise LLMProviderError(f"Anthropic request failed: {str(e)}")

async def _generate_openai_compatible(
    prompt: str,
    system_prompt: Optional[str],
    provider: str,
    api_key: Optional[str],
    model: Optional[str],
    temperature: float,
    max_tokens: int,
) -> str:
    """Generate response via OpenAI, Groq, or DeepSeek chat completions."""
    if not api_key:
        raise LLMProviderError(
            f"{provider.capitalize()} API key is missing. Enter your key in AI Settings (BYOK)."
        )

    if provider == "groq":
        base_url = "https://api.groq.com/openai/v1"
        model_name = (model or "llama-3.3-70b-versatile").strip()
    elif provider == "deepseek":
        base_url = "https://api.deepseek.com"
        model_name = (model or "deepseek-chat").strip()
    else:
        base_url = "https://api.openai.com/v1"
        model_name = (model or "gpt-4o-mini").strip()

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": messages,
    }
    if model_name.startswith(("o1", "o3")):
        payload["max_completion_tokens"] = max_tokens
    else:
        payload["temperature"] = temperature
        payload["max_tokens"] = max_tokens

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            if resp.status_code != 200:
                err_data = resp.json()
                err_msg = err_data.get("error", {}).get("message", resp.text)
                raise LLMProviderError(f"{provider.capitalize()} error ({resp.status_code}): {err_msg}")

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                raise LLMProviderError(f"{provider.capitalize()} returned empty choices.")

            return choices[0].get("message", {}).get("content", "").strip()
    except LLMProviderError:
        raise
    except Exception as e:
        raise LLMProviderError(f"{provider.capitalize()} request failed: {str(e)}")
