import unittest

from certificate_verification import (
    classify_verification_url,
    identify_verification_provider,
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
            ("https://www.linkedin.com/learning/certificates/example", "linkedin_learning"),
            ("https://www.udemy.com/certificate/example/", "udemy"),
            ("https://ude.my/UC-example", "udemy"),
            ("https://www.coursera.org/account/accomplishments/verify/example", "coursera"),
            ("https://www.coursera.org/account/accomplishments/certificate/example", "coursera"),
        ]
        for url, provider in urls:
            with self.subTest(url=url):
                result = classify_verification_url(url)
                self.assertEqual(result["verification_status"], "verification_pending")
                self.assertFalse(result["is_verified"])
                self.assertEqual(result["verification_provider"], provider)
                self.assertEqual(identify_verification_provider(url), provider)

    def test_insecure_url_is_rejected(self):
        result = classify_verification_url("http://www.credly.com/badges/example")
        self.assertEqual(result["verification_status"], "verification_link_invalid")
        self.assertFalse(result["is_verified"])

    def test_private_url_is_rejected(self):
        result = classify_verification_url("https://127.0.0.1/certificate/123")
        self.assertEqual(result["verification_status"], "verification_link_invalid")
        self.assertFalse(result["is_verified"])

    def test_certificate_skills_are_normalized_and_deduplicated(self):
        skills = normalize_certificate_skills([
            {"name": "Patient Care", "category": "Healthcare", "confidence": 0.8, "evidence": "Certificate competency"},
            {"name": " patient   care ", "category": "Healthcare", "confidence": 0.95},
            "Communication",
        ])
        by_name = {skill["name"].lower(): skill for skill in skills}
        self.assertEqual(len(skills), 2)
        self.assertAlmostEqual(by_name["patient care"]["confidence"], 0.95)
        self.assertEqual(by_name["communication"]["source"], "certificate")
        self.assertIn("evidence", by_name["communication"])


if __name__ == "__main__":
    unittest.main()
