"""Look up NIST conformers by verified PubChem InChIKey."""

import html
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


NIST_ORIGIN = "https://webbook.nist.gov"
PUBCHEM_ORIGIN = "https://pubchem.ncbi.nlm.nih.gov"
MAX_RESPONSE_BYTES = 20 * 1024 * 1024
INCHIKEY_PATTERN = re.compile(r"[A-Z]{14}-[A-Z]{10}-[A-Z]")
NIST_ID_PATTERN = re.compile(r"[A-Z][0-9]{3,12}")


def read_upstream(url):
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "text/html, application/json, chemical/x-mdl-sdfile"}
    if url.startswith(NIST_ORIGIN + "/"):
        headers["Referer"] = NIST_ORIGIN + "/chemistry/"
    request = Request(url, headers=headers)
    with urlopen(request, timeout=20) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("Upstream response exceeded the size limit")
    return body


def find_nist_3d(cid):
    property_url = f"{PUBCHEM_ORIGIN}/rest/pug/compound/cid/{cid}/property/InChIKey/JSON"
    properties = json.loads(read_upstream(property_url))
    entries = properties.get("PropertyTable", {}).get("Properties", [])
    inchikey = entries[0].get("InChIKey", "") if entries else ""
    if not INCHIKEY_PATTERN.fullmatch(inchikey):
        raise ValueError("PubChem did not provide a valid InChIKey")

    search_url = f"{NIST_ORIGIN}/cgi/cbook.cgi?InChI={quote(inchikey)}"
    search_html = read_upstream(search_url).decode("utf-8", "replace")
    if "Search Results" in search_html:
        ids = re.findall(r"href=[\"']/cgi/cbook\.cgi\?ID=([A-Z]\d{3,12})(?:&amp;|&|[\"'])", search_html)
    else:
        ids = re.findall(r"Str3File=([A-Z]\d{3,12})", search_html)
    ids = sorted(set(ids), key=lambda item: (not item.startswith("C"), item))[:12]

    for nist_id in ids:
        if not NIST_ID_PATTERN.fullmatch(nist_id):
            continue
        page_url = f"{NIST_ORIGIN}/cgi/cbook.cgi?ID={nist_id}"
        try:
            page = read_upstream(page_url).decode("utf-8", "replace")
            page_key = re.search(r'IUPAC Standard InChIKey:</strong>\s*<span[^>]*>([^<]+)</span>', page)
            if not page_key or html.unescape(page_key.group(1)).strip() != inchikey:
                continue
            if not re.search(rf"Str3File={re.escape(nist_id)}(?:[\"'&])", page):
                continue
            download_url = f"{NIST_ORIGIN}/cgi/cbook.cgi?Str3File={nist_id}"
            sdf = read_upstream(download_url).decode("utf-8", "replace")
            lines = sdf.replace("\r", "").split("\n")
            has_counts_line = len(lines) >= 5 and ("V2000" in lines[3] or "V3000" in lines[3])
            if not has_counts_line or "M  END" not in sdf:
                continue
            return {"found": True, "sdf": sdf, "inchikey": inchikey, "search_url": search_url, "page_url": page_url, "download_url": download_url}
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            continue
    return {"found": False, "inchikey": inchikey, "search_url": search_url}
