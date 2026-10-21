"""Tests hors ligne de backup.py (aucun réseau, aucune base).

    python3 -m unittest test_backup.py -v
"""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import backup


def page(count: int, prefix: str) -> list:
    return [{"id": f"{prefix}{i}"} for i in range(count)]


def make_dump(profiles: int = 2, attendances: int = 1) -> dict:
    return {
        "user_profiles": [
            {
                "id": f"u{i}",
                "user_number": i,
                "first_name": "Alice",
                "last_name": "Test",
            }
            for i in range(1, profiles + 1)
        ],
        "parcours": [{"id": "p1", "name": "Boucle"}],
        "attendances": [
            {
                "id": f"a{i}",
                "week_key": "2026-10-21",
                "user_number": 1,
                "status": "going",
            }
            for i in range(attendances)
        ],
        "participations": [
            {
                "id": "x1",
                "week_key": "2026-10-21",
                "user_number": 1,
                "parcours_id": "p1",
                "status": "yes",
            }
        ],
    }


class PaginationTest(unittest.TestCase):
    def test_lit_toutes_les_pages(self):
        pages = {
            0: page(backup.PAGE_SIZE, "a"),
            backup.PAGE_SIZE: page(backup.PAGE_SIZE, "b"),
            2 * backup.PAGE_SIZE: page(150, "c"),
        }
        calls = []

        def fake_curl(method, path, body_file=None):
            offset = int(path.rsplit("offset=", 1)[1])
            calls.append(offset)
            return json.dumps(pages.get(offset, [])).encode()

        with mock.patch.object(backup, "curl", side_effect=fake_curl):
            rows = backup.api_get("test")

        self.assertEqual(len(rows), 2 * backup.PAGE_SIZE + 150)
        self.assertEqual(calls, [0, backup.PAGE_SIZE, 2 * backup.PAGE_SIZE])

    def test_multiple_exact_du_plafond(self):
        pages = {0: page(backup.PAGE_SIZE, "a"), backup.PAGE_SIZE: []}
        calls = []

        def fake_curl(method, path, body_file=None):
            offset = int(path.rsplit("offset=", 1)[1])
            calls.append(offset)
            return json.dumps(pages.get(offset, [])).encode()

        with mock.patch.object(backup, "curl", side_effect=fake_curl):
            rows = backup.api_get("test")

        self.assertEqual(len(rows), backup.PAGE_SIZE)
        self.assertEqual(calls, [0, backup.PAGE_SIZE])

    def test_table_vide(self):
        with mock.patch.object(backup, "curl", return_value=b"[]"):
            self.assertEqual(backup.api_get("test"), [])


class ValidationTest(unittest.TestCase):
    def test_fichier_valide(self):
        counts = backup.validate_dump(make_dump())
        self.assertEqual(counts["user_profiles"], 2)
        self.assertEqual(counts["attendances"], 1)

    def test_table_absente(self):
        dump = make_dump()
        del dump["attendances"]
        with self.assertRaisesRegex(ValueError, "table absente"):
            backup.validate_dump(dump)

    def test_profils_vides_refuses(self):
        dump = {table: [] for table in backup.TABLES}
        with self.assertRaisesRegex(ValueError, "user_profiles est vide"):
            backup.validate_dump(dump)

    def test_profils_vides_avec_option(self):
        dump = {table: [] for table in backup.TABLES}
        counts = backup.validate_dump(dump, allow_empty=True)
        self.assertEqual(counts, {table: 0 for table in backup.TABLES})

    def test_presence_orpheline(self):
        dump = make_dump()
        dump["attendances"][0]["user_number"] = 99
        with self.assertRaisesRegex(ValueError, "absent de user_profiles"):
            backup.validate_dump(dump)

    def test_vote_orphelin(self):
        dump = make_dump()
        dump["participations"][0]["parcours_id"] = "inconnu"
        with self.assertRaisesRegex(ValueError, "absent de parcours"):
            backup.validate_dump(dump)

    def test_user_number_en_double(self):
        dump = make_dump()
        dump["user_profiles"][1]["user_number"] = 1
        with self.assertRaisesRegex(ValueError, "en double"):
            backup.validate_dump(dump)

    def test_meta_incoherente(self):
        dump = make_dump()
        dump["_meta"] = {"counts": {"user_profiles": 99}}
        with self.assertRaisesRegex(ValueError, "_meta annonce"):
            backup.validate_dump(dump)

    def test_statut_invalide(self):
        dump = make_dump()
        dump["attendances"][0]["status"] = "peut-etre"
        with self.assertRaisesRegex(ValueError, "statut invalide"):
            backup.validate_dump(dump)

    def test_vote_sans_presence_going(self):
        dump = make_dump()
        dump["attendances"][0]["status"] = "skip"
        with self.assertRaisesRegex(ValueError, "sans présence « going »"):
            backup.validate_dump(dump)

    def test_vote_sans_aucune_presence(self):
        dump = make_dump()
        dump["attendances"] = []
        with self.assertRaisesRegex(ValueError, "sans présence « going »"):
            backup.validate_dump(dump)


class SequenceTest(unittest.TestCase):
    def test_sql_setval(self):
        self.assertEqual(
            backup.sequence_sql(11),
            "SELECT setval('user_number_seq', 12, false);",
        )

    def test_sql_setval_base_vide(self):
        self.assertEqual(
            backup.sequence_sql(0),
            "SELECT setval('user_number_seq', 1, false);",
        )


class EnvTest(unittest.TestCase):
    def test_env_prime_sur_le_shell(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text("HAPPYRUNNERS_TEST_VAR=file\n")

            with mock.patch.dict(
                os.environ, {"HAPPYRUNNERS_TEST_VAR": "shell"}
            ):
                with redirect_stdout(io.StringIO()) as out:
                    backup.load_env(env_file)

                self.assertEqual(
                    os.environ["HAPPYRUNNERS_TEST_VAR"], "file"
                )
                self.assertIn("remplacée", out.getvalue())

    def test_fichier_absent(self):
        with self.assertRaises(SystemExit):
            backup.load_env(Path("/inexistant/.env"))


class ListTest(unittest.TestCase):
    def test_liste_ignore_meta(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            dump = make_dump()
            dump["_meta"] = {
                "format": backup.FORMAT_VERSION,
                "saved_at": "2026-10-20T00:00:00",
                "source": "https://exemple.supabase.co",
                "counts": {t: len(dump[t]) for t in backup.TABLES},
            }
            name = "happyrunners-2026-10-20_000000.json"
            (folder / name).write_text(json.dumps(dump), encoding="utf-8")

            with mock.patch.object(backup, "BACKUP_DIR", folder):
                with redirect_stdout(io.StringIO()) as out:
                    backup.cmd_list()

            # 2 profils + 1 parcours + 1 présence + 1 vote = 5.
            # Sans le filtrage, _meta ajouterait ses 4 clés.
            self.assertIn("5 lignes", out.getvalue())


class ParserTest(unittest.TestCase):
    def test_env_apres_la_sous_commande(self):
        args = backup.build_parser().parse_args(
            ["save", "--env", ".env.test"]
        )
        self.assertEqual(args.cmd, "save")
        self.assertEqual(args.env, ".env.test")

    def test_restore_dry_run(self):
        args = backup.build_parser().parse_args(
            ["restore", "f.json", "--dry-run"]
        )
        self.assertEqual(args.file, "f.json")
        self.assertTrue(args.dry_run)
        self.assertFalse(args.allow_empty)


if __name__ == "__main__":
    unittest.main()
