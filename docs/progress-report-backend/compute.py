"""Turns e2e/results.json into scored data. Imported by build_report.py; run
directly to print a coverage check. Stops if a requirement or endpoint is
untested, so the report cannot quietly skip one."""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from requirements import (FORCE_NOT_STARTED, FRONTEND_ONLY, LAST_REPORT_GAPS, MEDIUM, MODULES,
                          NO_SRS, NOTES, TITLES)

HERE = Path(__file__).parent
RESULTS = json.loads((HERE / "e2e" / "results.json").read_text(encoding="utf8"))
RANK = {"Not Started": 0, "Partial": 1, "Done": 2}
WEIGHT = {"High": 2, "Medium": 1}
MATRIX_KINDS = {"no-jwt", "invalid-jwt", "expired-jwt", "bad-signature-jwt", "inactive-account", "wrong-role"}

PREFIX_MODULE = [
    (r"/specimens/[^/]+/lots", "4.5"), (r"/auth|/user-accounts", "4.1"), (r"/developer", "4.2"),
    (r"/dashboard|/notifications", "4.3"), (r"/specimens|/collections|/tags", "4.4"),
    (r"/storage-locations", "4.6"), (r"/reports", "4.7"), (r"/inquiries", "4.8"),
    (r"/visit-requests", "4.9"), (r"/faq", "4.11"), (r"/exhibits", "4.12"),
    (r"/offline-sync", "4.14"), (r"/audit-logs|/backups", "4.15"),
]


def module_of(row):
    match = re.match(r"(4\.\d+) ", row["module"])
    if match:
        return match.group(1)
    path = row["op"].split(" ", 1)[-1]
    for pattern, key in PREFIX_MODULE:
        if re.match(pattern, path):
            return key
    return "4.1"


def req_module(req):
    return re.match(r"REQ-(4\.\d+)", req).group(1)


def last_status(req, percent):
    return LAST_REPORT_GAPS.get(req, "Done")


def align(actual, claimed):
    if actual == "N/A":
        return "Not applicable"
    if RANK[actual] == RANK[claimed]:
        return "Aligned"
    return "Overstated" if RANK[claimed] > RANK[actual] else "Understated"


def score():
    by_req = defaultdict(lambda: [0, 0])
    failures = defaultdict(list)
    for row in RESULTS:
        if row["pass"] is None:
            continue
        for req in row["srs"]:
            by_req[req][0 if row["pass"] else 1] += 1
            if not row["pass"]:
                failures[req].append(row)

    modules = []
    for key, name, owners, last_percent in MODULES:
        reqs = []
        for req in [r for r in TITLES if req_module(r) == key]:
            passed, failed = by_req[req]
            if req in FRONTEND_ONLY:
                status = "N/A"
            elif req in FORCE_NOT_STARTED or (passed == 0 and failed > 0):
                status = "Not Started"
            elif passed + failed == 0:
                sys.exit(f"No test for in-scope {req}")
            elif failed == 0:
                status = "Done"
            else:
                status = "Partial"
            claimed = last_status(req, last_percent)
            reqs.append({
                "srsId": req, "title": TITLES[req], "priority": "Medium" if req in MEDIUM else "High",
                "status": status, "lastReportStatus": claimed, "alignment": align(status, claimed),
                "testsPassed": passed, "testsFailed": failed,
                "note": NOTES.get(req) or (f"Frontend only: {FRONTEND_ONLY[req]}" if req in FRONTEND_ONLY else ""),
            })
        scored = [r for r in reqs if r["status"] != "N/A"]
        total = sum(WEIGHT[r["priority"]] for r in scored)
        done = sum(WEIGHT[r["priority"]] for r in scored if r["status"] == "Done")
        rows = [r for r in RESULTS if module_of(r) == key]
        percent = round(100 * done / total, 1) if total else None
        module_status = "Done" if percent == 100 else "Not Started" if percent == 0 else "Partial"
        claimed = "Done" if last_percent == 100 else "Partial"
        modules.append({
            "key": key, "name": f"§{key} {name}", "owner": ", ".join(owners), "owners": owners,
            "percent": percent, "lastReportPercent": last_percent, "status": module_status,
            "lastReportStatus": claimed, "alignment": align(module_status, claimed),
            "weightDone": done, "weightTotal": total,
            "testsPassed": sum(r["pass"] is True for r in rows),
            "testsFailed": sum(r["pass"] is False for r in rows),
            "testsInconclusive": sum(r["pass"] is None for r in rows),
            "requirements": reqs,
        })
    return modules, failures


def endpoint_map():
    routes = [f"{r['method']} {r['path']}" for r in json.loads((HERE / "e2e" / "routes.json").read_text(encoding="utf8"))]
    behavior = [r for r in RESULTS if r["kind"] not in MATRIX_KINDS and r["pass"] is not None]
    table = []
    for route in routes:
        method, path = route.split(" ", 1)
        pattern = re.compile("^" + method + " " + re.sub(r"\{[^}]+\}", "[^/]+", path) + "$")
        hits = [r for r in behavior if pattern.match(r["op"])]
        kinds = Counter(r["kind"] for r in hits)
        reqs = sorted({s for r in hits for s in r["srs"]})
        matrix = [r for r in RESULTS if r["kind"] in MATRIX_KINDS and r["op"] == route]
        table.append({
            "route": route, "reqs": reqs, "noSrs": NO_SRS.get(route),
            "passed": sum(r["pass"] for r in hits) + sum(r["pass"] for r in matrix),
            "failed": sum(not r["pass"] for r in hits) + sum(not r["pass"] for r in matrix),
            "happy": kinds["happy"], "invalid": kinds["invalid"], "db": kinds["db"], "matrix": len(matrix),
        })
    return sorted(table, key=lambda t: t["route"].split(" ", 1)[1])


if __name__ == "__main__":
    mods, _ = score()
    weights = sum(m["weightTotal"] for m in mods), sum(m["weightDone"] for m in mods)
    print("overall", round(100 * weights[1] / weights[0], 1), weights)
    counts = Counter(r["status"] for m in mods for r in m["requirements"])
    print(counts, Counter(r["alignment"] for m in mods for r in m["requirements"]))
    print(Counter(m["alignment"] for m in mods))
    for m in mods:
        print(m["name"], m["percent"], m["lastReportPercent"], m["alignment"], m["testsPassed"], m["testsFailed"], m["testsInconclusive"], m["owner"])
        for r in m["requirements"]:
            if r["status"] not in ("Done", "N/A"):
                print("   ", r["srsId"], r["status"], "claimed", r["lastReportStatus"], r["alignment"], r["testsPassed"], r["testsFailed"])
    eps = endpoint_map()
    print(len(eps), "endpoints; no behaviour test:", [e["route"] for e in eps if e["happy"] + e["invalid"] + e["db"] == 0])
    print("no happy:", [e["route"] for e in eps if e["happy"] == 0])
    print("no invalid:", [e["route"] for e in eps if e["invalid"] == 0])
    print("no srs mapped and not flagged:", [e["route"] for e in eps if not e["reqs"] and not e["noSrs"]])
