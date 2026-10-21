#!/usr/bin/env python3
"""
HappyRunners — export / restauration de la base.

Ne dépend que de la bibliothèque standard Python et de curl.

    python3 backup.py save [--env .env]
    python3 backup.py list
    python3 backup.py restore <fichier> [--env .env] [--dry-run] [--allow-empty]

Le fichier d'environnement par défaut est `.env`. `--env .env.test` cible une
autre base (par exemple le projet de test).

ATTENTION — restore REMPLACE le contenu des tables. Il prend automatiquement
une sauvegarde de l'état courant avant de supprimer quoi que ce soit, puis
vérifie les comptes après réécriture.

ATTENTION — la séquence `user_number_seq` n'est pas accessible via l'API REST.
À la fin d'un restore, le script affiche la commande SQL à exécuter et sort
avec le code 2 : tant qu'elle n'est pas passée, la restauration est INCOMPLÈTE.

ATTENTION — ces fichiers contiennent les noms et les votes de tes collègues.
Ils ne sont pas versionnés (voir .gitignore) et ne doivent pas circuler.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKUP_DIR = ROOT / "backups"

# Taille d'une page PostgREST. Le plafond par défaut de Supabase est 1000 :
# sans pagination, une table plus grande serait exportée tronquée en silence.
PAGE_SIZE = 1000
FORMAT_VERSION = 2

# L'ordre compte à la restauration :
# participations référence parcours, qui référence user_profiles.
TABLES = ["user_profiles", "parcours", "attendances", "participations"]


def die(msg: str) -> None:
    # Vider stdout avant stderr : sinon, dans un pipe, le message d'erreur
    # peut s'afficher au milieu d'une ligne de progression encore bufferisée.
    sys.stdout.flush()
    print(f"x {msg}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def incomplete(msg: str) -> None:
    sys.stdout.flush()
    print(f"!  {msg}", file=sys.stderr, flush=True)
    raise SystemExit(2)


def ok(msg: str) -> None:
    print(f"OK {msg}")


def warn(msg: str) -> None:
    print(f"!  {msg}")


def load_env(env_file: Path) -> None:
    """Lit le fichier d'environnement.

    Contrairement à l'ancienne version, le fichier est PRIORITAIRE sur le
    shell : un `VITE_SUPABASE_URL` resté exporté ne peut plus détourner une
    sauvegarde ou une restauration vers une autre base sans le dire.
    """
    if not env_file.exists():
        die(f"fichier d'environnement introuvable : {env_file}")

    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key in os.environ and os.environ[key] != value:
            warn(f"{key} : valeur du shell remplacée par {env_file.name}")
        os.environ[key] = value


def api_base() -> str:
    """URL du projet, sans slash final ni suffixe `/rest/v1` en trop."""
    base = os.environ["VITE_SUPABASE_URL"].rstrip("/")
    if base.endswith("/rest/v1"):
        base = base[: -len("/rest/v1")]
    return base


def curl(method: str, path: str, body_file: Path | None = None) -> bytes:
    """Appelle l'API REST via curl.

    curl et non urllib : le Python installe par python.org n'a pas de bundle
    de certificats CA, et urllib echoue alors que curl reussit.
    """
    cmd = [
        "curl", "-sS", "--fail-with-body", "--max-time", "60",
        "-X", method,
        "-H", "apikey: " + os.environ["VITE_SUPABASE_ANON_KEY"],
        "-H", "Authorization: Bearer " + os.environ["VITE_SUPABASE_ANON_KEY"],
        "-H", "Content-Type: application/json",
        "-H", "Prefer: return=minimal",
    ]
    if body_file:
        cmd += ["--data-binary", "@" + str(body_file)]
    cmd.append(api_base() + "/rest/v1" + path)

    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        detail = proc.stderr.decode()[:300] or proc.stdout.decode()[:300]
        die(f"{method} {path} a echoue : {detail}")
    return proc.stdout


def api_get_page(table: str, offset: int) -> list:
    path = (
        f"/{table}?select=*&order=id.asc"
        f"&limit={PAGE_SIZE}&offset={offset}"
    )
    return json.loads(curl("GET", path))


def api_get(table: str) -> list:
    """Lit toute une table, page par page.

    `order=id.asc` rend la pagination stable : sans ordre explicite,
    PostgREST peut renvoyer les mêmes lignes deux fois entre deux pages.
    """
    rows: list = []
    offset = 0
    while True:
        page = api_get_page(table, offset)
        if not isinstance(page, list):
            die(f"{table} : réponse inattendue de l'API")
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


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


def do_save(prefix: str = "happyrunners") -> Path:
    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    out = BACKUP_DIR / f"{prefix}-{stamp}.json"

    print(f"Export de {api_base()}")
    dump: dict = {}
    counts: dict[str, int] = {}

    for table in TABLES:
        print(f"  {table:<16}", end="", flush=True)
        rows = api_get(table)
        dump[table] = rows
        counts[table] = len(rows)
        print(f"{len(rows)} lignes")

    dump["_meta"] = {
        "format": FORMAT_VERSION,
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "source": api_base(),
        "counts": counts,
    }

    out.write_text(json.dumps(dump, ensure_ascii=False))

    # Relecture : détecte une écriture tronquée (disque plein, interruption).
    relu = json.loads(out.read_text(encoding="utf-8"))
    for table in TABLES:
        got = len(relu.get(table, []))
        if got != counts[table]:
            die(f"{table} : {got} lignes relues, {counts[table]} attendues")

    size_kb = out.stat().st_size / 1024
    ok(
        f"{out.name} — {size_kb:.0f} Ko, "
        f"{sum(counts.values())} lignes au total"
    )
    return out


def cmd_list() -> None:
    # Pas besoin de réseau ni de .env : `list` doit fonctionner hors ligne.
    files = sorted(BACKUP_DIR.glob("happyrunners-*.json"), reverse=True)
    if not files:
        warn(f"aucun backup dans {BACKUP_DIR.name}/")
        return

    print(f"Backups ({len(files)})")
    for f in files:
        try:
            dump = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            print(f"  {f.name:<40} illisible")
            continue
        # On ne compte que les 4 tables : `_meta` n'est pas un tableau de lignes.
        total = sum(len(dump.get(t, [])) for t in TABLES)
        detail = " ".join(f"{t[:4]}:{len(dump.get(t, []))}" for t in TABLES)
        label = f.stem.replace("happyrunners-", "")
        print(f"  {label:<32} {total:>5} lignes   {detail}")


def validate_dump(dump: dict, allow_empty: bool = False) -> dict[str, int]:
    """Refuse un fichier incomplet AVANT de supprimer quoi que ce soit."""
    if not isinstance(dump, dict):
        raise ValueError("le fichier ne contient pas un objet JSON")

    for table in TABLES:
        if table not in dump:
            raise ValueError(f"table absente : {table}")
        if not isinstance(dump[table], list):
            raise ValueError(f"{table} : ce n'est pas une liste")

    # Identifiants présents et uniques dans chaque table.
    for table in TABLES:
        ids = set()
        for row in dump[table]:
            if not isinstance(row, dict):
                raise ValueError(f"{table} : ligne qui n'est pas un objet")
            rid = row.get("id")
            if not rid:
                raise ValueError(f"{table} : ligne sans id")
            if rid in ids:
                raise ValueError(f"{table} : id {rid} en double")
            ids.add(rid)

    profiles = dump["user_profiles"]
    if not profiles and not allow_empty:
        raise ValueError(
            "user_profiles est vide : restauration refusée "
            "(--allow-empty pour forcer)"
        )

    users = set()
    for row in profiles:
        number = row.get("user_number")
        if number is None:
            raise ValueError("user_profiles : ligne sans user_number")
        if number in users:
            raise ValueError(f"user_profiles : user_number {number} en double")
        for field in ("first_name", "last_name"):
            if not row.get(field):
                raise ValueError(
                    f"user_profiles : {field} manquant pour {number}"
                )
        users.add(number)

    parcours_ids = {row["id"] for row in dump["parcours"]}

    for row in dump["attendances"]:
        if row.get("user_number") not in users:
            raise ValueError(
                "attendances : user_number "
                f"{row.get('user_number')} absent de user_profiles"
            )
        if not row.get("week_key"):
            raise ValueError("attendances : week_key manquant")
        if row.get("status") not in ("going", "skip"):
            raise ValueError(
                f"attendances : statut invalide {row.get('status')!r}"
            )

    # Un vote n'est valide que si la présence correspondante est « going ».
    # Indispensable depuis les triggers de la tâche 6 : un dump contenant
    # l'ancien orphelin #16 serait refusé par la base au moment du restore.
    going = {
        (row["week_key"], row["user_number"])
        for row in dump["attendances"]
        if row.get("status") == "going"
    }

    for row in dump["participations"]:
        if row.get("user_number") not in users:
            raise ValueError(
                "participations : user_number "
                f"{row.get('user_number')} absent de user_profiles"
            )
        if row.get("parcours_id") not in parcours_ids:
            raise ValueError(
                "participations : parcours_id "
                f"{row.get('parcours_id')} absent de parcours"
            )
        if not row.get("week_key"):
            raise ValueError("participations : week_key manquant")
        if row.get("status") not in ("yes", "no"):
            raise ValueError(
                f"participations : statut invalide {row.get('status')!r}"
            )
        if (row["week_key"], row["user_number"]) not in going:
            raise ValueError(
                "participations : vote sans présence « going » "
                f"(personne {row['user_number']}, semaine {row['week_key']})"
            )

    # Un fichier tronqué à l'écriture ou édité à la main se voit ici.
    meta_counts = (dump.get("_meta") or {}).get("counts")
    if meta_counts:
        for table in TABLES:
            announced = meta_counts.get(table)
            if announced != len(dump[table]):
                raise ValueError(
                    f"{table} : _meta annonce {announced} lignes, "
                    f"le fichier en contient {len(dump[table])}"
                )

    return {table: len(dump[table]) for table in TABLES}


def sequence_sql(max_user: int) -> str:
    return f"SELECT setval('user_number_seq', {max_user + 1}, false);"


def cmd_restore(path: str, dry_run: bool, allow_empty: bool) -> None:
    src = Path(path)
    if not src.exists():
        die(f"fichier introuvable : {path}")

    try:
        dump = json.loads(src.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        die(f"JSON invalide ({exc.lineno}:{exc.colno}) : {exc.msg}")

    try:
        counts = validate_dump(dump, allow_empty=allow_empty)
    except ValueError as exc:
        die(f"fichier refusé : {exc}")

    print(f"Restauration depuis {src.name}")
    print(f"Base cible : {api_base()}")
    for table in TABLES:
        print(f"  {table:<16} {counts[table]} lignes")
    print(f"  suppression     {' → '.join(reversed(TABLES))}")
    print(f"  réinsertion     {' → '.join(TABLES)}")

    if dry_run:
        ok("dry-run — aucune écriture effectuée")
        return

    warn(f"REMPLACE le contenu de : {', '.join(TABLES)}")
    answer = input("Écrire par-dessus les données actuelles ? tapez OUI : ")
    if answer.strip() != "OUI":
        die("annulé")

    # Point de retour AVANT toute suppression.
    pre = do_save(prefix="happyrunners-pre-restore")
    ok(f"sauvegarde préalable : {pre.name}")

    # Ordre inverse : évite de déclencher les cascades de clés étrangères.
    for table in reversed(TABLES):
        print(f"  suppression {table:<20}", end="", flush=True)
        api_delete_all(table)
        print("ok")

    for table in TABLES:
        rows = dump[table]
        print(f"  réinsertion {table:<20}", end="", flush=True)
        for row in rows:
            api_post(table, row)
        print(f"{len(rows)} lignes")

    print("  vérification", end="", flush=True)
    for table in TABLES:
        got = len(api_get(table))
        if got != counts[table]:
            print()
            die(
                f"{table} : {got} lignes après restauration, "
                f"{counts[table]} attendues.\n"
                f"  Sauvegarde préalable : {pre}\n"
                "  Corrige le fichier puis relance le restore."
            )
    print(" ok")
    ok("contenu restauré et vérifié")

    max_user = max(
        (row["user_number"] for row in dump["user_profiles"]), default=0
    )
    print()
    warn("La séquence user_number n'est pas accessible via l'API REST.")
    print("  Dans le SQL Editor du dashboard, exécute :")
    print(f"    {sequence_sql(max_user)}")
    print(f"  Prochain user_number attendu : {max_user + 1}")
    incomplete("RESTAURATION INCOMPLÈTE — exécute la commande ci-dessus")


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--env",
        default=".env",
        help="fichier d'environnement (défaut : .env)",
    )

    parser = argparse.ArgumentParser(
        description="Export / restauration de la base HappyRunners.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser(
        "save", parents=[common], help="exporte toutes les tables"
    )
    sub.add_parser(
        "list", parents=[common], help="liste les sauvegardes locales"
    )
    restore = sub.add_parser(
        "restore", parents=[common], help="recharge une sauvegarde"
    )
    restore.add_argument("file", help="fichier JSON à restaurer")
    restore.add_argument(
        "--dry-run",
        action="store_true",
        help="affiche le plan sans écrire",
    )
    restore.add_argument(
        "--allow-empty",
        action="store_true",
        help="autorise un fichier sans aucun profil",
    )
    return parser


def main(argv=None) -> None:
    args = build_parser().parse_args(argv)

    # `list` est purement local : ni réseau, ni fichier d'environnement.
    if args.cmd == "list":
        cmd_list()
        return

    env_path = Path(args.env)
    if not env_path.is_absolute():
        env_path = ROOT / env_path
    load_env(env_path)

    for var in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"):
        if not os.environ.get(var):
            die(f"{var} absent (fichier {env_path.name})")

    if args.cmd == "save":
        do_save()
    elif args.cmd == "restore":
        cmd_restore(args.file, args.dry_run, args.allow_empty)


if __name__ == "__main__":
    main()
