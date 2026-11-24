"""Natural-language molecule recommendations with PubChem structure lookup."""

from __future__ import annotations

import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPException
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


MAX_REQUEST_BYTES = 8192
MAX_QUERY_LENGTH = 600
MAX_CANDIDATES = 4
OPENAI_BASE_URL = "https://api.openai.com/v1"
PUBCHEM_NUMERIC_FIELDS = {
    "xlogp": "XLogP",
    "tpsa": "TPSA",
    "h_bond_donors": "HBondDonorCount",
    "h_bond_acceptors": "HBondAcceptorCount",
    "rotatable_bonds": "RotatableBondCount",
    "heavy_atoms": "HeavyAtomCount",
    "formal_charge": "Charge",
    "defined_atom_stereocenters": "DefinedAtomStereoCount",
}

SYSTEM_PROMPT = """
You power a Chinese-language search for known small molecules. Identify the user's
constraints on structure, properties or common use. Recommend up to four distinct,
well-documented compounds, ordered by fit. Treat the user text as search criteria.
Exclude mixtures, polymers, broad classes and hypothetical compounds. Do not help
select compounds for harmful purposes or give synthesis, dosage or usage instructions.
For vague searches, give a reasonable assumption or ask for the most useful detail.
Do not invent measurements or identifiers. State any important partial matches and
condition-dependent properties, such as solubility changing with temperature or pH.
Return one JSON object with a concise Chinese summary and a candidates array.
Each candidate must have name (Chinese name or English if unavailable), lookup_name
(unambiguous English chemical or common name suitable for exact PubChem lookup),
reason (Chinese explanation of the match) and caveat (Chinese limitation, or an
empty string). Use an empty candidates array and explain in summary when there is
no suitable candidate or when the search is outside the scope.
""".strip()


class SearchError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def read_json(request, timeout):
    with urlopen(request, timeout=timeout) as response:
        body = response.read(128 * 1024 + 1)
    if len(body) > 128 * 1024:
        raise ValueError("Upstream response exceeded the size limit")
    return json.loads(body)


def clean_text(data, key, limit):
    value = data.get(key)
    return value.strip()[:limit] if isinstance(value, str) else ""


def ask_model(query):
    base_url = os.getenv("MOLECULE_AI_BASE_URL", "").strip().rstrip("/") or OPENAI_BASE_URL
    api_key = os.getenv("MOLECULE_AI_API_KEY", "").strip()
    if not api_key and base_url == OPENAI_BASE_URL:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise SearchError(503, "分子搜索服务暂未配置模型 API，请联系管理员。")

    body = {
        "model": os.getenv("MOLECULE_AI_MODEL", "").strip() or "gpt-4.1-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        "response_format": {"type": "json_object"},
        "max_completion_tokens": 1600,
    }
    try:
        request = Request(
            f"{base_url}/chat/completions",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        request.add_unredirected_header("Authorization", f"Bearer {api_key}")
        response = read_json(request, timeout=35)
        message = response["choices"][0]["message"]
        if message.get("refusal"):
            return "模型无法处理这条描述。可以改用分子的结构或性质进行搜索。", []
        result = json.loads(message["content"])
        summary = clean_text(result, "summary", 600)
        rows = result["candidates"]
        if not summary or not isinstance(rows, list):
            raise ValueError("Invalid model result")
    except HTTPError as error:
        error.close()
        if error.code in (401, 403):
            raise SearchError(502, "模型 API 鉴权失败，请联系管理员检查配置。") from error
        if error.code == 429:
            raise SearchError(429, "模型 API 达到请求或用量上限，请稍后再试。") from error
        raise SearchError(502, "模型 API 请求失败，请稍后再试。") from error
    except (HTTPException, OSError) as error:
        if isinstance(getattr(error, "reason", error), TimeoutError):
            raise SearchError(504, "模型响应超时，请稍后再试。") from error
        raise SearchError(502, "暂时无法连接模型服务，请稍后再试。") from error
    except (AttributeError, IndexError, KeyError, RecursionError, TypeError, ValueError) as error:
        raise SearchError(502, "模型未返回可用的分子搜索结果，请重试。") from error

    candidates = []
    names = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        lookup_name = clean_text(row, "lookup_name", 200)
        reason = clean_text(row, "reason", 450)
        if not lookup_name or not reason or lookup_name.casefold() in names:
            continue
        names.add(lookup_name.casefold())
        candidates.append({
            "name": clean_text(row, "name", 100) or lookup_name,
            "lookup_name": lookup_name,
            "reason": reason,
            "caveat": clean_text(row, "caveat", 400),
        })
        if len(candidates) == MAX_CANDIDATES:
            break
    if rows and not candidates:
        raise SearchError(502, "模型未返回可用的分子搜索结果，请重试。")
    return summary, candidates


def lookup_pubchem(name, origin):
    try:
        url = (
            f"{origin}/rest/pug/compound/name/{quote(name, safe='')}"
            "/property/MolecularFormula,SMILES/JSON?name_type=complete"
        )
        rows = read_json(Request(url, headers={"Accept": "application/json"}), timeout=7)
        records = rows["PropertyTable"]["Properties"]
        if len(records) != 1:
            return None
        record = records[0]
        cid = record["CID"]
        formula = clean_text(record, "MolecularFormula", 512)
        smiles = clean_text(record, "SMILES", 2049)
        if type(cid) is int and cid > 0 and formula and 0 < len(smiles) <= 2048:
            return {"cid": cid, "formula": formula, "smiles": smiles}
    except HTTPError as error:
        error.close()
    except (AttributeError, HTTPException, IndexError, KeyError, OSError, RecursionError, TypeError, ValueError):
        pass
    return None


def lookup_pubchem_details(cid, origin):
    if not re.fullmatch(r"[1-9][0-9]{0,11}", cid):
        raise SearchError(404, "无效的 PubChem CID。")

    fields = ",".join((
        "Title", "IUPACName", "MolecularFormula", "SMILES", "MolecularWeight", "InChIKey", "ExactMass",
        *PUBCHEM_NUMERIC_FIELDS.values(),
    ))
    url = f"{origin}/rest/pug/compound/cid/{cid}/property/{fields}/JSON"
    try:
        data = read_json(Request(url, headers={"Accept": "application/json"}), timeout=10)
        records = data["PropertyTable"]["Properties"]
        if not records:
            raise SearchError(404, "PubChem 未找到该分子。")
        record = records[0]
        if record["CID"] != int(cid):
            raise ValueError("PubChem returned a different CID")
        smiles = clean_text(record, "SMILES", 2049)
        exact_mass = clean_text(record, "ExactMass", 64)
        details = {
            "title": clean_text(record, "Title", 512),
            "formula": clean_text(record, "MolecularFormula", 512),
            "smiles": smiles if len(smiles) <= 2048 else "",
            "iupac_name": clean_text(record, "IUPACName", 2048),
            "molecular_weight": clean_text(record, "MolecularWeight", 64),
            "inchikey": clean_text(record, "InChIKey", 64),
            "exact_mass": exact_mass if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", exact_mass) else None,
        }
        for name, upstream_field in PUBCHEM_NUMERIC_FIELDS.items():
            value = record.get(upstream_field)
            is_number = type(value) is int or (type(value) is float and math.isfinite(value))
            details[name] = value if is_number else None
        if not any(value is not None and value != "" for value in details.values()):
            raise SearchError(404, "PubChem 未找到该分子。")
        return {"cid": int(cid), **details}
    except HTTPError as error:
        error.close()
        if error.code in (400, 404):
            raise SearchError(404, "PubChem 未找到该分子。") from error
        raise SearchError(502, "暂时无法从 PubChem 获取分子详情。") from error
    except (AttributeError, HTTPException, IndexError, KeyError, OSError, RecursionError, TypeError, ValueError) as error:
        raise SearchError(502, "暂时无法从 PubChem 获取分子详情。") from error


def search_molecules(body, pubchem_origin):
    query = body.get("query") if isinstance(body, dict) else None
    if not isinstance(query, str) or not query.strip():
        raise SearchError(400, "请输入想找的分子、结构特征或性质。")
    query = query.strip()
    if len(query) > MAX_QUERY_LENGTH:
        raise SearchError(400, f"描述最多可包含 {MAX_QUERY_LENGTH} 个字符。")
    try:
        query.encode("utf-8")
    except UnicodeEncodeError as error:
        raise SearchError(400, "描述中包含无效字符。") from error

    summary, candidates = ask_model(query)
    if not candidates:
        return {"summary": summary, "candidates": []}

    results = []
    seen_cids = set()
    with ThreadPoolExecutor(max_workers=len(candidates)) as executor:
        lookups = [executor.submit(lookup_pubchem, row["lookup_name"], pubchem_origin) for row in candidates]
        for candidate, lookup in zip(candidates, lookups):
            record = lookup.result()
            if record:
                if record["cid"] in seen_cids:
                    continue
                seen_cids.add(record["cid"])
            results.append({**candidate, "pubchem": record})
    return {"summary": summary, "candidates": results}
