"""Flask entry point for the standalone molecule search application."""

import os
import re
from functools import lru_cache
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from flask import Flask, Response, abort, jsonify, render_template, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge

from molecule_search import MAX_REQUEST_BYTES, SearchError, lookup_pubchem_details, search_molecules
from structure_sources import MAX_RESPONSE_BYTES, PUBCHEM_ORIGIN, find_nist_3d


ROOT = Path(__file__).resolve().parent
SEARCH_ROOT = ROOT / "molecule-search"
ASSET_ROOT = ROOT / "assets"
ASSETS = {
    "RDKit_minimal.js", "RDKit_minimal.wasm", "three.min.js", "crystal-core.js",
    "pointer-controls.js", "molecule-core.js", "viewer-2d.js", "viewer-3d.js",
    "3Dmol-2.5.5.min.js", "LICENSE-3Dmol.txt", "LICENSE-Molecule-Viewer.txt",
}
SEARCH_ASSETS = {"app.js", "styles.css", "detail.js", "detail.css", "molecule-view.js", "structure-drawing.js"}
CID_PATTERN = re.compile(r"[1-9][0-9]{0,11}")
app = Flask(__name__, static_folder=None, template_folder=str(SEARCH_ROOT))


def demo_mode():
    return os.getenv("MOLECULE_SEARCH_DEMO") == "1"


@app.get("/")
@app.get("/molecule-search/", strict_slashes=False)
@app.get("/molecule-search/index.html")
def index():
    return render_template("index.html", demo=demo_mode())


@app.get("/molecule-search/detail")
@app.get("/molecule-search/detail.html")
def detail():
    return render_template("detail.html", demo=demo_mode())


@app.get("/molecule-search/<asset>")
def search_asset(asset):
    if asset not in SEARCH_ASSETS and not (demo_mode() and asset == "demo-data.js"):
        abort(404)
    return send_from_directory(SEARCH_ROOT, asset)


@app.get("/molecule-search/conformers/<cid>.sdf")
def demo_conformer(cid):
    if not demo_mode() or not CID_PATTERN.fullmatch(cid):
        abort(404)
    return send_from_directory(SEARCH_ROOT / "conformers", f"{cid}.sdf", mimetype="chemical/x-mdl-sdfile")


@app.get("/<asset>")
def shared_asset(asset):
    if asset not in ASSETS:
        abort(404)
    return send_from_directory(ASSET_ROOT, asset)


@app.get("/healthz")
def health():
    return jsonify(status="ok")


@app.post("/api/molecule-search")
def molecule_search_api():
    request.max_content_length = MAX_REQUEST_BYTES
    try:
        response = jsonify(search_molecules(request.get_json(silent=True), PUBCHEM_ORIGIN))
    except RequestEntityTooLarge:
        response = jsonify(error="请求内容过长。")
        response.status_code = 413
    except RecursionError:
        response = jsonify(error="请提交包含分子描述的 JSON。")
        response.status_code = 400
    except SearchError as error:
        response = jsonify(error=str(error))
        response.status_code = error.status
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/molecule-search/details/<cid>")
def molecule_search_details_api(cid):
    try:
        response = jsonify(lookup_pubchem_details(cid, PUBCHEM_ORIGIN))
    except SearchError as error:
        return jsonify(error=str(error)), error.status
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.get("/api/pubchem/cid/<cid>/SDF")
def pubchem_sdf(cid):
    if not CID_PATTERN.fullmatch(cid):
        abort(404)
    record_type = request.args.get("record_type")
    if record_type not in ("2d", "3d"):
        abort(400)
    url = f"{PUBCHEM_ORIGIN}/rest/pug/compound/cid/{cid}/SDF?record_type={record_type}"
    upstream = Request(url, headers={"Accept": "chemical/x-mdl-sdfile, text/plain"})
    try:
        with urlopen(upstream, timeout=20) as result:
            body = result.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        error.close()
        if error.code == 404:
            return jsonify(error="PubChem 暂无该分子的结构记录。"), 404
        return jsonify(error="暂时无法读取 PubChem 的结构记录。"), 502
    except (HTTPException, OSError):
        return jsonify(error="暂时无法连接 PubChem。"), 502
    if len(body) > MAX_RESPONSE_BYTES:
        return jsonify(error="PubChem 返回的结构记录过大。"), 502
    response = Response(body, mimetype="chemical/x-mdl-sdfile")
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@lru_cache(maxsize=128)
def cached_nist_result(cid):
    return find_nist_3d(cid)


@app.get("/api/nist/3d/<cid>")
def nist_3d(cid):
    if not CID_PATTERN.fullmatch(cid):
        abort(404)
    try:
        return jsonify(cached_nist_result(cid))
    except (HTTPException, OSError, ValueError, KeyError):
        return jsonify(error="暂时无法查询 NIST 的三维结构。"), 502
