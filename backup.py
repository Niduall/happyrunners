#!/usr/bin/env python3
"""
HappyRunners - export / restauration de la base.

Ne depend que de curl-less : la bibliotheque standard Python et les variables
d'environnement de l'app (dans .env).

    python3 backup.py save            exporte la prod dans backups/<date>.json
    python3 backup.py list            liste les backups disponibles
    python3 backup.py restore <fic>   recharge un backup

ATTENTION - restore REMPLACE le contenu des tables. A n'utiliser qu'en cas de
base corrompue, ou sur une base neuve apres avoir joue schema.sql.

ATTENTION - ces fichiers contiennent les noms et les votes de tes collegues.
Ils ne sont pas versionnes (voir .gitignore) et ne doivent pas circuler.
"""

import json
import os
import sys
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKUP_DIR = ROOT / "backups"

# L'ordre compte a la restauration :
# participations reference parcours, qui reference user_profiles.
TABLES = ["user_profiles", "parcours", "attendances", "participations"]


def die(msg: str) -> None:
    print(f"x {msg}", file=sys.stderr)
    raise SystemExit(1)


def ok(msg: str) -> None:
    print(f"OK {msg}")


def warn(msg: str) -> None:
    print(f"!  {msg}")


def load_env() -> None:
    """Lit .env sans dependre d'un shell - les valeurs sont simples."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def curl(method: str, path: str, body_file: Path | None = None) -> bytes:
    """Appelle l'API REST via curl.

    curl et non urllib : le Python installe par python.org n'a pas de bundle
    de certificats CA, et urllib echoue alors que curl reussit.
    """
    cmd = [
        "curl", "-sS", "--fail-with-body",
        "-X", method,
        "-H", "apikey: " + os.environ["VITE_SUPABASE_ANON_KEY"],
        "-H", "Authorization: Bearer " + os.environ["VITE_SUPABASE_ANON_KEY"],
        "-H", "Content-Type: application/json",
        "-H", "Prefer: return=minimal",
    ]
    if body_file:
        cmd += ["--data-binary", "@" + str(body_file)]
    cmd.append(os.environ["VITE_SUPABASE_URL"] + "/rest/v1" + path)

    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        detail = proc.stderr.decode()[:300] or proc.stdout.decode()[:300]
        die(f"{method} {path} a echoue : {detail}")
    return proc.stdout


def api_get(table: str) -> list:
    return json.loads(curl("GET", f"/{table}?select=*"))


def api_post(table: str, row: dict) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(row, fh)
        tmp = Path(fh.name)
    try:
        curl("POST", f"/{table}", body_file=tmp)
    finally:
        tmp.unlink(missing_ok=True)


def api_delete_all(table: str) -> None:
    # Filtre always-false : efface toutes les lignes sans lister les id.
    never = "00000000-0000-0000-0000-000000000000"
    curl("DELETE", f"/{table}?id=neq.{never}")


def cmd_save() -> None:
    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    out = BACKUP_DIR / f"happyrunners-{stamp}.json"

    print(f"Export de {os.environ['VITE_SUPABASE_URL']}")
    dump = {}
    for table in TABLES:
        print(f"  {table:<16}", end="", flush=True)
        # On conserve les id : participations.parcours_id les reference,
        # les regenereer casserait le lien entre votes et parcours.
        rows = api_get(table)
        dump[table] = rows
        print(f"{len(rows)} lignes")

    out.write_text(json.dumps(dump, ensure_ascii=False))
    size_kb = out.stat().st_size / 1024
    ok(f"{out.name} - {size_kb:.0f} Ko")


def cmd_list() -> None:
    files = sorted(BACKUP_DIR.glob("happyrunners-*.json"), reverse=True)
    if not files:
        warn(f"aucun backup dans {BACKUP_DIR.name}/")
        return
    print(f"Backups ({len(files)})")
    for f in files:
        dump = json.loads(f.read_text())
        total = sum(len(v) for v in dump.values())
        detail = " ".join(f"{t[:4]}:{len(dump.get(t, []))}" for t in TABLES)
        print(f"  {f.stem.replace('happyrunners-', ''):<20} {total:>4} lignes   {detail}")


def cmd_restore(path: str) -> None:
    src = Path(path)
    if not src.exists():
        die(f"fichier introuvable : {path}")

    dump = json.loads(src.read_text())

    print(f"Restauration depuis {src.name}")
    print(f"Base cible : {os.environ['VITE_SUPABASE_URL']}\n")
    warn(f"REMPLACE le contenu de : {', '.join(TABLES)}")

    answer = input("Ecrire par-dessus les donnees actuelles ? tapez OUI : ")
    if answer.strip() != "OUI":
        die("annule")

    for table in TABLES:
        rows = dump.get(table, [])
        print(f"  {table:<16}", end="", flush=True)
        # Vide la table. Le filtre always-false efface tout sans coder d'ID.
        api_delete_all(table)
        for row in rows:
            api_post(table, row)
        print(f"{len(rows)} lignes reecrites")

    ok("contenu restaure")
    warn("Reinitialise la sequence pour eviter un user_number duplique :")
    print("    Dans le SQL Editor du dashboard :")
    print("      SELECT setval('user_number_seq',")
    print("             COALESCE((SELECT MAX(user_number) FROM user_profiles), 0) + 1,")
    print("             false);")


def main() -> None:
    load_env()
    for var in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"):
        if not os.environ.get(var):
            die(f"{var} absent (pas de .env ?)")

    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "save":
        cmd_save()
    elif cmd == "list":
        cmd_list()
    elif cmd == "restore":
        if len(sys.argv) < 3:
            die("usage : backup.py restore <fichier.json>")
        cmd_restore(sys.argv[2])
    else:
        print(__doc__)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
