import unittest

from certificate_verification import (
    classify_verification_url,
    normalize_certificate_skills,
)


class CertificateVerificationTests(unittest.TestCase):
    def test_no_link_is_not_verified(self):
        result = classify_verification_url("")
        self.assertEqual(result["verification_status"], "no_verification_link")
        self.assertFalse(result["is_verified"])

    def test_unknown_host_requires_manual_review(self):
        result = classify_verification_url("https://example.org/verify/123")
        self.assertEqual(result["verification_status"], "verification_link_found_unconfirmed")
        self.assertFalse(result["is_verified"])

    def test_trusted_host_is_pending_not_automatically_verified(self):
        result = classify_verification_url("https://www.credly.com/badges/example")
        self.assertEqual(result["verification_status"], "verification_pending")
        self.assertFalse(result["is_verified"])

    def test_learning_platform_hosts_are_supported_but_not_preverified(self):
        urls = [
            "https://www.linkedin.com/learning/certificates/example",
            "https://www.udemy.com/certificate/example/",
            "https://www.coursera.org/account/accomplishments/certificate/example",
        ]
        for url in urls:
            with self.subTest(url=url):
                result = classify_verification_url(url)
                self.assertEqual(result["verification_status"], "verification_pending")
                self.assertFalse(result["is_verified"])

    def test_insecure_url_is_rejected(self):
        result = classify_verification_url("http://www.credly.com/badges/example")
        self.assertEqual(result["verification_status"], "verification_link_invalid")
        self.assertFalse(result["is_verified"])

    def test_certificate_skills_are_normalized_and_deduplicated(self):
        skills = normalize_certificate_skills([
            {"name": "Patient Care", "category": "Healthcare", "confidence": 0.8},
            {"name": " patient   care ", "category": "Healthcare", "confidence": 0.95},
            "Communication",
        ])
        by_name = {skill["name"].lower(): skill for skill in skills}
        self.assertEqual(len(skills), 2)
        self.assertAlmostEqual(by_name["patient care"]["confidence"], 0.95)
        self.assertEqual(by_name["communication"]["source"], "certificate")


if __name__ == "__main__":
    unittest.main()
