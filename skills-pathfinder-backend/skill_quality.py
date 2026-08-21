"""Runtime skill-quality helpers for Skills Pathfinder.

The original fallback used substring matching for every skill. That caused
single-letter programming languages such as C and R to be detected inside
ordinary academic words. This module keeps those valid skills available while
requiring contextual/boundary evidence for short tokens.
"""

import re
from typing import Any, Dict, List


def _contains_skill(text: str, skill: str) -> bool:
    lower = text.lower()
    candidate = skill.lower().strip()
    if not candidate:
        return False

    # Single-letter languages must have explicit programming context.
    if candidate == "c":
        patterns = [
            r"\bc\s+programming\b",
            r"\bprogramming\s+(?:in\s+)?c\b",
            r"\bc\s+language\b",
            r"\blanguage\s+c\b",
        ]
        return any(re.search(pattern, lower) for pattern in patterns)

    if candidate == "r":
        patterns = [
            r"\br\s+programming\b",
            r"\bprogramming\s+(?:in\s+)?r\b",
            r"\br\s+language\b",
            r"\blanguage\s+r\b",
            r"\brstudio\b",
        ]
        return any(re.search(pattern, lower) for pattern in patterns)

    # Short tokens and symbols must match as standalone tokens.
    if len(candidate) <= 3 or any(ch in candidate for ch in "+#."):
        return bool(re.search(rf"(?<![a-z0-9]){re.escape(candidate)}(?![a-z0-9])", lower))

    return candidate in lower


def build_safe_local_skill_fallback(common_skills):
    def safe_local_skill_fallback(text: str) -> List[Dict[str, Any]]:
        found = []
        for skill in common_skills:
            if _contains_skill(text or "", skill):
                found.append({
                    "name": skill,
                    "category": "Detected Skill",
                    "confidence": 0.70,
                    "source": "document",
                })
        return found
    return safe_local_skill_fallback


def install_main_skill_patch(main_module) -> None:
    main_module.local_skill_fallback = build_safe_local_skill_fallback(main_module.COMMON_SKILLS)
