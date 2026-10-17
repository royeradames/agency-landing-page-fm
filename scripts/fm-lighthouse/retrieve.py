import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys

assert len(sys.argv) == 3
source = Path(sys.argv[1])
destination = Path(sys.argv[2])
assert source.stat().st_size <= 16777216
assert not destination.exists()
reports = {}
for line in source.read_text().splitlines():
    marker = line.find("FM_REPORT ")
    if marker < 0:
        continue
    row = json.loads(line[marker + len("FM_REPORT "):])
    name = row["name"]
    assert name in ["hosted-receipt.json", "mobile/lhr.json", "mobile/receipt.json", "mobile-ordinary.json", "desktop/lhr.json", "desktop/receipt.json", "desktop-ordinary.json"]
    if row["kind"] == "begin":
        assert name not in reports and 0 < row["rawBytes"] <= 8388608
        assert row["encoding"] == "gzip+base64" and 0 < row["chunks"] <= 2048
        reports[name] = {"metadata": row, "chunks": [], "end": False}
    elif row["kind"] == "chunk":
        report = reports[name]
        assert not report["end"] and row["index"] == len(report["chunks"])
        assert len(row["data"]) <= 4096
        report["chunks"].append(row["data"])
    else:
        assert row["kind"] == "end"
        report = reports[name]
        assert not report["end"] and row["rawSha256"] == report["metadata"]["rawSha256"]
        report["end"] = True
decoded = {}
for name, report in reports.items():
    metadata = report["metadata"]
    assert report["end"] and len(report["chunks"]) == metadata["chunks"]
    compressed = base64.b64decode("".join(report["chunks"]), validate=True)
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as archive:
        raw = archive.read(8388609)
    assert len(raw) == metadata["rawBytes"] <= 8388608
    assert hashlib.sha256(raw).hexdigest() == metadata["rawSha256"]
    decoded[name] = raw
assert "hosted-receipt.json" in decoded
receipt = json.loads(decoded["hosted-receipt.json"])
devices = ["mobile", "desktop"]
attempted = [attempt["device"] for attempt in receipt["attempts"]]
assert receipt["plannedAudits"] == 2
assert attempted == devices[:len(attempted)] and len(attempted) <= 2
assert receipt["unrun"] == devices[len(attempted):]
assert all(device + "-ordinary.json" in decoded for device in attempted)
if receipt["state"] == "TWO_SINGLE_PASSES_PUBLIC_BYTES_BOUND_EXTERNAL_DEPLOYMENT_REVIEW_REQUIRED":
    assert attempted == devices and not receipt["unrun"]
    assert set(decoded) == {"hosted-receipt.json", "mobile/lhr.json", "mobile/receipt.json", "mobile-ordinary.json", "desktop/lhr.json", "desktop/receipt.json", "desktop-ordinary.json"}
destination.mkdir()
for name, raw in decoded.items():
    subject = destination / name
    subject.parent.mkdir(parents=True, exist_ok=True)
    subject.write_bytes(raw)
state = "COMPLETE_FRAMES_HASH_VERIFIED_EXTERNAL_SOURCE_AND_EVIDENCE_REVIEW_STILL_REQUIRED" if receipt["state"] == "TWO_SINGLE_PASSES_PUBLIC_BYTES_BOUND_EXTERNAL_DEPLOYMENT_REVIEW_REQUIRED" else "PARTIAL_FRAMES_HASH_VERIFIED_DECLARED_ATTEMPT_REPORTS_PRESENT_EXECUTION_COMPLETENESS_UNPROVEN"
print(json.dumps({"state": state, "files": len(decoded), "workflowState": receipt["state"]}))
