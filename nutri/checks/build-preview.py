"""Build a self-contained DEMO ONLY review of the actual static source.

No backend configuration, service worker or patient data is embedded.
Useful for visual review when the execution host cannot bind a local server.
"""
from pathlib import Path
import base64
import re

root = Path(__file__).resolve().parent.parent
dist = root / "dist" if (root / "dist").is_dir() else root
out = root / "review"
out.mkdir(exist_ok=True)

def data_uri(path, mime):
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode()

css = ""
for weight in [400, 500, 600, 700, 800]:
    font = dist / f"assets/fonts/files/archivo-latin-{weight}-normal.woff2"
    css += "@font-face{font-family:Archivo;font-style:normal;font-weight:" + str(weight) + ";src:url(" + data_uri(font, "font/woff2") + ") format('woff2');font-display:swap}"
css += (dist / "style.css").read_text() + (dist / "patient.css").read_text()
scripts = []
for name in ["vendor/receitas-db.js", "vendor/composicao-corporal.js", "vendor/nutricao-core.js",
             "vendor/medalhas-core.js", "vendor/identidade-marca.js", "vendor/alimentos-db.js"]:
    scripts.append((dist / name).read_text())
modules = []
for name in ["assessment.js", "vendor/medalha-visual.js", "patient-experience.js", "platform.js", "app.js"]:
    source = (dist / name).read_text()
    source = re.sub(r"^import .+?;\s*$", "", source, flags=re.M)
    source = re.sub(r"\bexport (?=(?:function|const) )", "", source)
    if name == "patient-experience.js":
        source = source.replace("assets/nutrition-cover.png", data_uri(dist / "assets/nutrition-cover.png", "image/png"))
    if name == "app.js":
        source = re.sub(r"^if\('serviceWorker' in navigator\).*$", "", source, flags=re.M)
        source = source.replace("role:'nutri',page:'overview'", "role:'patient',page:'today'")
        # A portable review must not initiate real authentication.
        source = source.replace("window.TORQUE_NUTRI_CONFIG||{}", "{}")
    modules.append(source)
scripts.append("(()=>{\n" + "\n".join(modules) + "\n})();")
html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Torque Nutri · Prévia local demonstrativa</title><style>' + css + '</style><body><div id="app"></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal"><div id="modal-body"></div></dialog>'
for script in scripts:
    html += "<script>" + script.replace("</script", "<\\/script") + "</script>"
html += "</body></html>"
target = out / "torque-nutri-preview.html"
target.write_text(html)
print(f"Demo-only preview: {target} ({target.stat().st_size} bytes)")
