import base64
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

DECODER = Path(__file__).with_name("retrieve.py")
SUCCESS = "TWO_SINGLE_PASSES_PUBLIC_BYTES_BOUND_EXTERNAL_DEPLOYMENT_REVIEW_REQUIRED"
COMPLETE = "COMPLETE_FRAMES_HASH_VERIFIED_EXTERNAL_SOURCE_AND_EVIDENCE_REVIEW_STILL_REQUIRED"
PARTIAL = "PARTIAL_FRAMES_HASH_VERIFIED_DECLARED_ATTEMPT_REPORTS_PRESENT_EXECUTION_COMPLETENESS_UNPROVEN"
DEVICES = ["mobile", "desktop"]


def payloads(attempted, success=False):
    receipt = {"state": SUCCESS if success else "HOLD_INCOMPLETE", "plannedAudits": 2, "attempts": [{"device": device, "exitCode": 0 if success else 1, "signal": None, "failure": None} for device in attempted], "unrun": [device for device in DEVICES if device not in attempted]}
    reports = {"hosted-receipt.json": receipt}
    for device in attempted:
        reports[device + "-ordinary.json"] = {"device": device, "exitCode": 0 if success else 1, "signal": None, "failure": None, "stdout": "", "stderr": ""}
        if success:
            reports[device + "/lhr.json"] = {"syntheticTransportFixtureOnly": True}
            reports[device + "/receipt.json"] = {"syntheticTransportFixtureOnly": True}
    return reports


def framed(reports):
    lines = []
    for name, payload in reports.items():
        raw = json.dumps(payload).encode()
        digest = hashlib.sha256(raw).hexdigest()
        encoded = base64.b64encode(gzip.compress(raw)).decode()
        chunks = [encoded[index:index + 4096] for index in range(0, len(encoded), 4096)]
        lines.append({"kind": "begin", "name": name, "rawBytes": len(raw), "rawSha256": digest, "encoding": "gzip+base64", "chunks": len(chunks)})
        lines.extend({"kind": "chunk", "name": name, "index": index, "data": data} for index, data in enumerate(chunks))
        lines.append({"kind": "end", "name": name, "rawSha256": digest})
    return "\n".join("FM_REPORT " + json.dumps(row) for row in lines)


class ExpectedReportCompleteness(unittest.TestCase):
    def decode(self, reports):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            ordinary = root / "ordinary.log"
            ordinary.write_text(framed(reports))
            output = root / "decoded"
            result = subprocess.run([sys.executable, "-B", str(DECODER), str(ordinary), str(output)], capture_output=True, text=True, timeout=10)
            names = {str(subject.relative_to(output)) for subject in output.rglob("*") if subject.is_file()} if output.exists() else set()
            return result, names

    def test_success_requires_exact_seven_reports(self):
        reports = payloads(DEVICES, success=True)
        result, names = self.decode(reports)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(names, set(reports))
        self.assertEqual(json.loads(result.stdout)["state"], COMPLETE)

    def test_success_rejects_each_whole_missing_report(self):
        reports = payloads(DEVICES, success=True)
        for missing in reports:
            with self.subTest(missing=missing):
                result, names = self.decode({name: value for name, value in reports.items() if name != missing})
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(names)

    def test_partial_requires_ordinary_report_for_each_declared_attempt(self):
        for attempted in [["mobile"], DEVICES]:
            reports = payloads(attempted)
            result, names = self.decode(reports)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(names, set(reports))
            self.assertEqual(json.loads(result.stdout)["state"], PARTIAL)
            for device in attempted:
                with self.subTest(attempted=attempted, missing=device):
                    result, names = self.decode({name: value for name, value in reports.items() if name != device + "-ordinary.json"})
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(names)

    def test_zero_declared_attempts_never_claims_complete_execution(self):
        result, names = self.decode(payloads([]))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(names, {"hosted-receipt.json"})
        self.assertEqual(json.loads(result.stdout)["state"], PARTIAL)

    def test_partial_rejects_nonprefix_attempt_shape(self):
        result, names = self.decode(payloads(["desktop"]))
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(names)

    def test_partial_rejects_inconsistent_unrun_shape(self):
        reports = payloads(["mobile"])
        reports["hosted-receipt.json"]["unrun"] = []
        result, names = self.decode(reports)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(names)


if __name__ == "__main__":
    unittest.main()
