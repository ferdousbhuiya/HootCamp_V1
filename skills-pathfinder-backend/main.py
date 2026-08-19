# ============================================================
# Skills Pathfinder - FastAPI Backend
# Version 1.2.0
#
# Supports:
#   PDF
#   Scanned PDF / OCR
#   DOCX
#   TXT
#   PNG
#   JPG
#   JPEG
#
# AI:
#   Groq
#   openai/gpt-oss-20b
#
# Database:
#   Supabase
# ============================================================

import os
import io
import json
import re
import traceback
from typing import List, Dict, Any, Optional

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
)

from fastapi.responses import JSONResponse

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from PyPDF2 import PdfReader

import pdfplumber

import pytesseract

from PIL import Image

import docx

from groq import Groq

from supabase import create_client, Client


# ============================================================
# 1. ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# 2. APPLICATION
# ============================================================

app = FastAPI(
    title="Skills Pathfinder API",
    version="1.2.0",
    description="Backend API for the Skills Pathfinder Master's Project"
)


# ============================================================
# 3. CORS
# ============================================================

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,"
    "http://localhost:5173,"
    "https://ferdouse.us,"
    "https://www.ferdouse.us,"
    "https://skillpathfinder.ferdous.us"
).split(",")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 4. SUPABASE
# ============================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
    """
    Lazily initialize Supabase.
    """

    global _supabase_client

    if _supabase_client is None:

        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be configured."
            )

        _supabase_client = create_client(
            SUPABASE_URL,
            SUPABASE_KEY
        )

    return _supabase_client


# ============================================================
# 5. GROQ CONFIGURATION
# ============================================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Free-model friendly default.
# No new API key is required.
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b"
)


if not GROQ_API_KEY:
    print("[WARN] GROQ_API_KEY is not configured.")


groq_client = Groq(
    api_key=GROQ_API_KEY
) if GROQ_API_KEY else None


# ============================================================
# 6. OCR CONFIGURATION
# ============================================================

TESSERACT_CMD = os.getenv(
    "TESSERACT_CMD",
    "tesseract"
)

pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


try:

    from pdf2image import convert_from_bytes

    PDF2IMAGE_AVAILABLE = True

except ImportError:

    PDF2IMAGE_AVAILABLE = False


# ============================================================
# 7. CONSTANTS
# ============================================================

MAX_FILE_SIZE = 15 * 1024 * 1024

# Important for Groq free-tier testing.
#
# We deliberately keep the AI output below the 8K TPM limit.
#
# A typical 2-3 page resume will fit comfortably.
AI_MAX_OUTPUT_TOKENS = 3000


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg"
}


# ============================================================
# 8. ROOT
# ============================================================

@app.get("/")
def read_root():

    return {
        "status": "Skills Pathfinder API is online.",
        "version": "1.2.0"
    }


# ============================================================
# 9. DEBUG ENVIRONMENT
# ============================================================

@app.get("/debug-env")
def debug_env():

    return {
        "groq_key_set": bool(GROQ_API_KEY),
        "groq_model": GROQ_MODEL,
        "supabase_configured": bool(
            SUPABASE_URL and SUPABASE_KEY
        ),
        "tesseract_command": TESSERACT_CMD,
        "pdf2image_available": PDF2IMAGE_AVAILABLE
    }


# ============================================================
# 10. TEXT CLEANING
# ============================================================

def clean_extracted_text(text: str) -> str:
    """
    Clean PDF/DOCX/OCR text without destroying useful information.
    """

    if not text:
        return ""

    # Normalize line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove null characters
    text = text.replace("\x00", " ")

    # Normalize excessive spaces
    text = re.sub(r"[ \t]+", " ", text)

    # Reduce excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ============================================================
# 11. PDF EXTRACTION
# ============================================================

def extract_text_from_pdf(file_bytes: bytes) -> str:

    print("[PDF] Starting PDF extraction...")

    extracted_parts = []

    # --------------------------------------------------------
    # Method 1: PyPDF2
    # --------------------------------------------------------

    try:

        reader = PdfReader(
            io.BytesIO(file_bytes)
        )

        print(
            f"[PDF] Number of pages: {len(reader.pages)}"
        )

        for page_number, page in enumerate(
            reader.pages,
            start=1
        ):

            try:

                page_text = page.extract_text()

                if page_text:
                    extracted_parts.append(page_text)

            except Exception as e:

                print(
                    f"[PDF] PyPDF2 page {page_number} "
                    f"error: {e}"
                )

    except Exception as e:

        print(
            f"[PDF] PyPDF2 extraction failed: {e}"
        )


    text = "\n".join(extracted_parts)

    print(
        f"[PDF] Standard extraction: {len(text)} characters"
    )


    # --------------------------------------------------------
    # Method 2: pdfplumber fallback
    # --------------------------------------------------------

    if len(text.strip()) < 100:

        print(
            "[PDF] Very little text found. "
            "Trying pdfplumber..."
        )

        try:

            plumber_parts = []

            with pdfplumber.open(
                io.BytesIO(file_bytes)
            ) as pdf:

                for page in pdf.pages:

                    page_text = page.extract_text()

                    if page_text:
                        plumber_parts.append(
                            page_text
                        )

            plumber_text = "\n".join(
                plumber_parts
            )

            if len(plumber_text.strip()) > len(
                text.strip()
            ):

                text = plumber_text

                print(
                    f"[PDF] pdfplumber extracted "
                    f"{len(text)} characters"
                )

        except Exception as e:

            print(
                f"[PDF] pdfplumber failed: {e}"
            )


    # --------------------------------------------------------
    # Method 3: OCR fallback
    # --------------------------------------------------------

    if len(text.strip()) < 100:

        if PDF2IMAGE_AVAILABLE:

            print(
                "[PDF] Very little text found. "
                "Starting OCR..."
            )

            try:

                images = convert_from_bytes(
                    file_bytes,
                    dpi=200
                )

                ocr_parts = []

                for index, image in enumerate(
                    images,
                    start=1
                ):

                    print(
                        f"[OCR] Processing PDF page {index}"
                    )

                    image = image.convert("L")

                    page_text = pytesseract.image_to_string(
                        image
                    )

                    if page_text:
                        ocr_parts.append(
                            page_text
                        )

                ocr_text = "\n".join(
                    ocr_parts
                )

                if len(ocr_text.strip()) > len(
                    text.strip()
                ):

                    text = ocr_text

                    print(
                        f"[OCR] Extracted "
                        f"{len(text)} characters"
                    )

            except Exception as e:

                print(
                    f"[OCR] PDF OCR failed: {e}"
                )

        else:

            print(
                "[PDF] pdf2image is not available."
            )


    return clean_extracted_text(text)


# ============================================================
# 12. DOCX EXTRACTION
# ============================================================

def extract_text_from_docx(
    file_bytes: bytes
) -> str:

    print("[DOCX] Starting DOCX extraction...")

    try:

        document = docx.Document(
            io.BytesIO(file_bytes)
        )

        parts = []

        # ----------------------------------------------------
        # Paragraphs
        # ----------------------------------------------------

        for paragraph in document.paragraphs:

            text = paragraph.text.strip()

            if text:
                parts.append(text)

        # ----------------------------------------------------
        # Tables
        # ----------------------------------------------------

        for table in document.tables:

            for row in table.rows:

                cells = []

                for cell in row.cells:

                    cell_text = cell.text.strip()

                    if cell_text:
                        cells.append(cell_text)

                if cells:

                    parts.append(
                        " | ".join(cells)
                    )

        text = "\n".join(parts)

        print(
            f"[DOCX] Extracted {len(text)} characters"
        )

        return clean_extracted_text(text)

    except Exception as e:

        print(
            f"[DOCX] Extraction error: {e}"
        )

        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted DOCX file."
        )


# ============================================================
# 13. IMAGE OCR
# ============================================================

def extract_text_from_image(
    file_bytes: bytes
) -> str:

    print("[OCR] Processing image...")

    try:

        image = Image.open(
            io.BytesIO(file_bytes)
        )

        # Grayscale improves OCR on many documents.
        image = image.convert("L")

        text = pytesseract.image_to_string(
            image
        )

        print(
            f"[OCR] Extracted {len(text)} characters"
        )

        return clean_extracted_text(text)

    except Exception as e:

        print(
            f"[OCR] Image processing error: {e}"
        )

        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted image file."
        )


# ============================================================
# 14. TEXT FILE EXTRACTION
# ============================================================

def extract_text_from_txt(
    file_bytes: bytes
) -> str:

    try:

        try:

            text = file_bytes.decode(
                "utf-8"
            )

        except UnicodeDecodeError:

            text = file_bytes.decode(
                "latin-1"
            )

        return clean_extracted_text(text)

    except Exception:

        raise HTTPException(
            status_code=400,
            detail="Could not read TXT file."
        )


# ============================================================
# 15. GROQ LLM
# ============================================================

async def llm_generate(
    prompt: str,
    max_tokens_override: int = AI_MAX_OUTPUT_TOKENS
):

    if not groq_client:

        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured."
        )

    try:

        print(
            f"[LLM] Calling Groq API "
            f"model={GROQ_MODEL}, "
            f"max_tokens={max_tokens_override}"
        )

        completion = groq_client.chat.completions.create(

            model=GROQ_MODEL,

            messages=[
                {
                    "role": "system",
                    "content": (
                        "Return only valid JSON. "
                        "No markdown. "
                        "No explanation outside JSON."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],

            temperature=0.1,

            max_tokens=max_tokens_override,

            response_format={
                "type": "json_object"
            }
        )

        response_text = (
            completion
            .choices[0]
            .message
            .content
        )

        print(
            f"[LLM] Response length: "
            f"{len(response_text or '')} characters"
        )

        return response_text

    except Exception as e:

        error_text = str(e)

        print(
            f"[LLM] Groq API Error: {error_text}"
        )

        # Make the actual problem visible.
        if "413" in error_text or "tokens per minute" in error_text:

            raise HTTPException(
                status_code=429,
                detail=(
                    "Groq free-tier token limit reached. "
                    "The document/request is too large. "
                    "Please try again after a short wait."
                )
            )

        raise HTTPException(
            status_code=502,
            detail=(
                f"Failed to connect to Groq API: "
                f"{error_text}"
            )
        )


# ============================================================
# 16. LOCAL SKILL FALLBACK
# ============================================================

# This is intentionally used as a safety net.
#
# If the AI ever fails, we don't want the student to see
# "0 skills" when obvious skills are present.

COMMON_SKILLS = [

    # Programming
    "Python",
    "Java",
    "JavaScript",
    "TypeScript",
    "C",
    "C++",
    "C#",
    "SQL",
    "R",
    "PHP",
    "HTML",
    "CSS",

    # Data
    "Pandas",
    "NumPy",
    "Scikit-learn",
    "TensorFlow",
    "PyTorch",
    "Power BI",
    "Tableau",
    "Excel",
    "Advanced Excel",
    "Power Query",
    "DAX",
    "Statistics",
    "Data Analysis",
    "Data Analytics",
    "Machine Learning",
    "Deep Learning",

    # Databases
    "MySQL",
    "PostgreSQL",
    "SQL Server",
    "Oracle",
    "MongoDB",

    # Cloud
    "AWS",
    "Microsoft Azure",
    "Azure",
    "Google Cloud",
    "GCP",

    # Development
    "Git",
    "GitHub",
    "Docker",
    "FastAPI",
    "Django",
    "Flask",
    "React",
    "Node.js",

    # Engineering
    "AutoCAD",
    "Electrical Engineering",
    "Electrical Power",
    "Power Distribution",
    "Power System",
    "Solar Power",
    "Power Plant",
    "Steam Power Plant",

    # Business
    "QuickBooks",
    "Project Management",

    # Methodologies
    "Agile",
    "Scrum",
    "Six Sigma",

    # General
    "Communication",
    "Leadership",
    "Problem Solving",
    "Teamwork"
]


def local_skill_fallback(
    text: str
) -> List[Dict[str, Any]]:

    lower_text = text.lower()

    found = []

    for skill in COMMON_SKILLS:

        if skill.lower() in lower_text:

            found.append(
                {
                    "name": skill,
                    "category": "Detected Skill",
                    "confidence": 0.70,
                    "source": "document"
                }
            )

    return found


# ============================================================
# 17. NORMALIZE SKILLS
# ============================================================

def normalize_skill_name(
    name: str
) -> str:

    name = str(name).strip()

    name = re.sub(
        r"\s+",
        " ",
        name
    )

    return name


def deduplicate_skills(
    skills: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:

    unique = {}

    for skill in skills:

        if not isinstance(skill, dict):
            continue

        name = normalize_skill_name(
            skill.get("name", "")
        )

        if not name:
            continue

        key = name.lower()

        if key not in unique:

            skill["name"] = name

            unique[key] = skill

        else:

            # Keep the higher confidence.
            old_conf = float(
                unique[key].get(
                    "confidence",
                    0
                )
            )

            new_conf = float(
                skill.get(
                    "confidence",
                    0
                )
            )

            if new_conf > old_conf:

                unique[key] = skill

    return list(unique.values())


# ============================================================
# 18. COMPREHENSIVE AI SKILL EXTRACTION
# ============================================================

async def extract_skills_with_llm(
    text: str
) -> dict:

    text = clean_extracted_text(text)

    if not text:

        return {
            "skills": [],
            "explanations": []
        }


    # --------------------------------------------------------
    # IMPORTANT:
    #
    # Keep prompt compact.
    #
    # The previous implementation requested 8192 output
    # tokens and created a request of 10,018 tokens.
    #
    # This version keeps the request comfortably below the
    # free 8,000 TPM limit for normal resumes.
    # --------------------------------------------------------

    prompt = f"""
Analyze this student's resume/document and extract EVERY meaningful skill.

Look carefully through:
- summary
- work experience
- education
- projects
- certifications
- courses
- technical skills
- software/tools
- engineering/domain experience
- methodologies
- soft skills

Do NOT summarize groups of skills.
For example:
"Python, SQL, Power BI and Excel"
must produce four separate skills.

Include specific technologies, software, programming languages,
frameworks, tools, engineering knowledge, analytical methods,
standards, certifications and professional skills.

Avoid inventing skills that are not supported by the document.

Return ONLY this JSON structure:

{{
  "skills": [
    {{
      "name": "Python",
      "category": "Programming Language",
      "confidence": 0.95
    }}
  ],
  "explanations": [
    {{
      "skill": "Python",
      "reasoning": "Mentioned in the technical skills section.",
      "evidence": "Python, SQL, Power BI"
    }}
  ]
}}

Allowed categories:
Programming Language
Framework/Library
Tool/Software
Database
Cloud
Data/Analytics
Domain Knowledge
Methodology/Standard
Soft Skill
Certification
Other

DOCUMENT:

{text}
"""


    try:

        llm_response = await llm_generate(
            prompt,
            max_tokens_override=AI_MAX_OUTPUT_TOKENS
        )

        skills_data = json.loads(
            llm_response
        )

        skills = skills_data.get(
            "skills",
            []
        )

        explanations = skills_data.get(
            "explanations",
            []
        )

        skills = deduplicate_skills(
            skills
        )

        print(
            f"[AI] Extracted "
            f"{len(skills)} unique skills"
        )

        return {
            "skills": skills,
            "explanations": explanations
        }

    except json.JSONDecodeError as e:

        print(
            f"[AI] JSON parsing error: {e}"
        )

        return {
            "skills": [],
            "explanations": []
        }

    except HTTPException:

        raise

    except Exception as e:

        print(
            f"[AI] Skill extraction error: {e}"
        )

        return {
            "skills": [],
            "explanations": []
        }


# ============================================================
# 19. CERTIFICATE EXTRACTION
# ============================================================

async def extract_certificate_data(
    text: str,
    filename: str
) -> dict:

    prompt = f"""
Extract certificate information from this document.

Return only JSON:

{{
  "certification_name": "",
  "provider": "",
  "credential_id": "",
  "verification_url": ""
}}

Do not invent information.

Certificate/document:

{text}
"""


    try:

        response = await llm_generate(
            prompt,
            max_tokens_override=800
        )

        data = json.loads(response)

    except Exception as e:

        print(
            f"[CERTIFICATE] AI extraction failed: {e}"
        )

        data = {}


    if not data.get(
        "certification_name"
    ):

        data["certification_name"] = (
            os.path.splitext(filename)[0]
        )


    if not data.get("provider"):

        data["provider"] = "Unknown"


    if "auto_verified" not in data:

        url = data.get(
            "verification_url",
            ""
        )

        if url and re.search(
            r"(aws\.amazon\.com|"
            r"coursera\.org|"
            r"udemy\.com|"
            r"edx\.org|"
            r"google\.com|"
            r"microsoft\.com|"
            r"cisco\.com|"
            r"comptia\.org|"
            r"credly\.com|"
            r"credential\.net)",
            url,
            re.IGNORECASE
        ):

            data["auto_verified"] = True

        else:

            data["auto_verified"] = False


    return data


# ============================================================
# 20. DOCUMENT UPLOAD
# ============================================================

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    filename = file.filename or "unknown"

    print(
        f"[UPLOAD] Received file: {filename}"
    )


    # --------------------------------------------------------
    # Extension
    # --------------------------------------------------------

    file_ext = os.path.splitext(
        filename
    )[1].lower()


    if file_ext not in ALLOWED_EXTENSIONS:

        return JSONResponse(
            status_code=400,
            content={
                "detail": (
                    "Unsupported file type. "
                    "Allowed: PDF, DOCX, TXT, "
                    "PNG, JPG, JPEG"
                )
            }
        )


    # --------------------------------------------------------
    # Read file
    # --------------------------------------------------------

    file_bytes = await file.read()

    file_size = len(file_bytes)

    print(
        f"[UPLOAD] File size: {file_size:,} bytes"
    )


    if file_size > MAX_FILE_SIZE:

        return JSONResponse(
            status_code=400,
            content={
                "detail": (
                    "File size exceeds "
                    "15MB limit."
                )
            }
        )


    # --------------------------------------------------------
    # Extract text
    # --------------------------------------------------------

    print(
        f"[EXTRACT] Processing {file_ext} file..."
    )


    try:

        if file_ext == ".pdf":

            text = extract_text_from_pdf(
                file_bytes
            )

        elif file_ext == ".docx":

            text = extract_text_from_docx(
                file_bytes
            )

        elif file_ext == ".txt":

            text = extract_text_from_txt(
                file_bytes
            )

        else:

            text = extract_text_from_image(
                file_bytes
            )


    except HTTPException:

        raise

    except Exception as e:

        print(
            f"[EXTRACT] Error: {e}"
        )

        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not extract text: {e}"
            )
        )


    text = clean_extracted_text(
        text
    )


    print(
        f"[EXTRACT] Final text length: "
        f"{len(text)} characters"
    )


    if len(text.strip()) < 10:

        return JSONResponse(
            status_code=400,
            content={
                "detail": (
                    "Could not extract meaningful "
                    "text. The file may be blank, "
                    "image-only, encrypted, or unreadable."
                )
            }
        )


    # --------------------------------------------------------
    # AI skill extraction
    # --------------------------------------------------------

    print(
        "[AI] Starting comprehensive "
        "document analysis..."
    )


    ai_failed = False

    try:

        skills_data = (
            await extract_skills_with_llm(
                text
            )
        )

    except HTTPException as e:

        print(
            f"[AI] LLM extraction failed: "
            f"{e.detail}"
        )

        skills_data = {
            "skills": [],
            "explanations": []
        }

        ai_failed = True

    except Exception as e:

        print(
            f"[AI] Unexpected AI failure: {e}"
        )

        skills_data = {
            "skills": [],
            "explanations": []
        }

        ai_failed = True


    skills = skills_data.get(
        "skills",
        []
    )


    explanations = skills_data.get(
        "explanations",
        []
    )


    # --------------------------------------------------------
    # Local fallback
    # --------------------------------------------------------

    if not skills:

        print(
            "[FALLBACK] AI returned no skills. "
            "Running local skill detection..."
        )

        fallback_skills = (
            local_skill_fallback(text)
        )

        skills = deduplicate_skills(
            fallback_skills
        )

        if skills:

            explanations = [
                {
                    "skill": skill["name"],
                    "reasoning": (
                        "Detected directly in "
                        "the uploaded document."
                    ),
                    "evidence": skill["name"]
                }
                for skill in skills
            ]


    print(
        f"[SUCCESS] {filename}: "
        f"{len(text)} characters, "
        f"{len(skills)} skills"
    )


    # --------------------------------------------------------
    # Recommendations
    # --------------------------------------------------------

    try:

        recommendations = (
            get_career_recommendations(
                skills,
                top_n=5
            )
        )

    except Exception as e:

        print(
            f"[RECOMMENDATION] Error: {e}"
        )

        recommendations = []


    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return {
        "message": (
            "File processed successfully"
        ),
        "filename": filename,
        "extracted_skills": skills,
        "explanations": explanations,
        "recommendations": recommendations,
        "character_count": len(text),
        "skills_count": len(skills),
        "ai_failed": ai_failed
    }


# ============================================================
# 21. CERTIFICATE VERIFICATION
# ============================================================

@app.post("/api/verify-certificate")
async def verify_certificate(
    file: UploadFile = File(...)
):

    try:

        filename = (
            file.filename or "certificate"
        )

        file_bytes = await file.read()

        file_ext = os.path.splitext(
            filename
        )[1].lower()


        if file_ext == ".pdf":

            text = extract_text_from_pdf(
                file_bytes
            )

        elif file_ext in {
            ".png",
            ".jpg",
            ".jpeg"
        }:

            text = extract_text_from_image(
                file_bytes
            )

        elif file_ext == ".docx":

            text = extract_text_from_docx(
                file_bytes
            )

        else:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported certificate file. "
                    "Use PDF, DOCX, PNG, JPG or JPEG."
                )
            )


        if len(text.strip()) < 10:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract certificate text."
                )
            )


        data = await extract_certificate_data(
            text,
            filename
        )


        return data


    except HTTPException:

        raise

    except Exception as e:

        print(
            f"[CERTIFICATE] Error: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error processing certificate: {e}"
            )
        )


# ============================================================
# 22. CAREER RECOMMENDATIONS
# ============================================================

class SkillsRequest(BaseModel):

    extracted_skills: List[
        Dict[str, Any]
    ]


@app.post("/api/recommendations")
async def get_recommendations(
    skills_request: SkillsRequest
):

    try:

        recommendations = (
            get_career_recommendations(
                skills_request.extracted_skills,
                top_n=5
            )
        )

        return {
            "status": "success",
            "total_recommendations": len(
                recommendations
            ),
            "recommendations": recommendations
        }

    except Exception as e:

        print(
            f"[ERROR] Recommendation Error: {e}"
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error generating recommendations: "
                f"{e}"
            )
        )


# ============================================================
# 23. CAREER PATHS
# ============================================================

@app.get("/api/career-paths")
async def get_all_career_paths():

    try:

        from recommendation_engine import (
            CAREER_PATHS
        )

        career_list = [

            {
                "id": career["id"],
                "path": career["path"],
                "category": career["category"],
                "job_outlook": career[
                    "job_outlook"
                ],
                "median_salary": career[
                    "median_salary"
                ]
            }

            for career in CAREER_PATHS
        ]


        return {
            "status": "success",
            "career_paths": career_list
        }

    except Exception as e:

        print(
            f"[ERROR] Career paths error: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ============================================================
# 24. SKILL GAP ANALYSIS
# ============================================================

@app.post("/api/skill-gap-analysis")
async def skill_gap_analysis(
    skills_request: SkillsRequest,
    career_id: str
):

    try:

        analysis = get_skill_gap_analysis(
            skills_request.extracted_skills,
            career_id
        )


        if not analysis:

            raise HTTPException(
                status_code=404,
                detail="Career path not found"
            )


        return {
            "status": "success",
            "analysis": analysis
        }


    except HTTPException:

        raise

    except Exception as e:

        print(
            f"[ERROR] Skill Gap Analysis: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error analyzing skill gap: {e}"
            )
        )


# ============================================================
# 25. CAREER ADVICE
# ============================================================

class ReportRequest(BaseModel):

    skills: List[str]


@app.post("/api/generate-career-advice")
async def generate_career_advice(
    request: ReportRequest
):

    try:

        skills_text = ", ".join(
            request.skills
        ) if request.skills else (
            "No skills provided"
        )


        prompt = f"""
Create a career development report for a student.

Skills:
{skills_text}

Return ONLY JSON:

{{
  "executive_summary": "",
  "swot_analysis": {{
    "strengths": [],
    "weaknesses": [],
    "opportunities": [],
    "threats": []
  }},
  "action_plan": {{
    "30_days": "",
    "60_days": "",
    "90_days": ""
  }},
  "recommended_next_skills": []
}}

Be practical and specific.
"""


        response = await llm_generate(
            prompt,
            max_tokens_override=1800
        )


        advice_data = json.loads(
            response
        )


        return {
            "status": "success",
            "advice": advice_data
        }


    except HTTPException:

        raise

    except Exception as e:

        print(
            f"[ERROR] Advice Generation Error: {e}"
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error generating advice: {e}"
            )
        )


# ============================================================
# 26. HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "service": "Skills Pathfinder API",
        "version": "1.2.0",
        "ai_model": GROQ_MODEL
    }


# ============================================================
# 27. STARTUP INFORMATION
# ============================================================

@app.on_event("startup")
async def startup_event():

    print("=" * 60)

    print(
        "Skills Pathfinder API starting..."
    )

    print(
        f"AI Model: {GROQ_MODEL}"
    )

    print(
        f"Groq configured: "
        f"{bool(GROQ_API_KEY)}"
    )

    print(
        f"Supabase configured: "
        f"{bool(SUPABASE_URL and SUPABASE_KEY)}"
    )

    print(
        f"Tesseract: "
        f"{TESSERACT_CMD}"
    )

    print(
        f"PDF OCR available: "
        f"{PDF2IMAGE_AVAILABLE}"
    )

    print("=" * 60)
