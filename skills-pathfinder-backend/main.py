# main.py
# Skills Pathfinder Backend
# Supports: PDF, DOCX, TXT, JPG, JPEG, PNG
# Includes PDF text extraction + OCR fallback + Groq skill extraction

import os
import io
import json
import re
import traceback
from typing import List, Dict, Any

# ---------------------------------------------------------
# Load environment variables FIRST
# ---------------------------------------------------------
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------
# FastAPI
# ---------------------------------------------------------
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------
# Document processing
# ---------------------------------------------------------
from PyPDF2 import PdfReader
import docx
from PIL import Image
import pytesseract

# Optional scanned-PDF OCR
try:
    from pdf2image import convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

# ---------------------------------------------------------
# AI / Database
# ---------------------------------------------------------
from groq import Groq
from supabase import create_client, Client

# ---------------------------------------------------------
# Your existing recommendation engine
# ---------------------------------------------------------
from recommendation_engine import (
    get_career_recommendations,
    get_skill_gap_analysis
)


# =========================================================
# 1. CONFIGURATION
# =========================================================

APP_NAME = "Skills Pathfinder API"
APP_VERSION = "1.0.0"

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg"
}

# Tesseract
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "tesseract")
pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

# Groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "llama-3.3-70b-versatile"
)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase_client: Client | None = None


# =========================================================
# 2. FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Backend API for the Skills Pathfinder Master's Project"
)


# =========================================================
# 3. CORS
# =========================================================

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,"
    "http://localhost:5173,"
    "https://ferdouse.us,"
    "https://www.ferdouse.us"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# 4. SUPABASE
# =========================================================

def get_supabase() -> Client:
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


# =========================================================
# 5. GROQ CLIENT
# =========================================================

groq_client = None

if GROQ_API_KEY:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        print("[OK] Groq client initialized")
    except Exception as e:
        print(f"[ERROR] Could not initialize Groq client: {e}")
else:
    print("[WARNING] GROQ_API_KEY is not configured")


# =========================================================
# 6. LLM GENERATION
# =========================================================

async def llm_generate(
    prompt: str,
    max_tokens_override: int = 4096
):

    if not GROQ_API_KEY or groq_client is None:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured on the backend."
        )

    try:

        print(
            f"[LLM] Calling Groq API "
            f"model={GROQ_MODEL}"
        )

        completion = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a strict JSON generator. "
                        "Return ONLY valid JSON. "
                        "Do not use markdown. "
                        "Do not use ```json. "
                        "Do not include explanations outside the JSON object."
                    )
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1,
            max_tokens=max_tokens_override,
            response_format={"type": "json_object"}
        )

        response_text = completion.choices[0].message.content

        if not response_text:
            raise RuntimeError(
                "Groq returned an empty response."
            )

        print(
            f"[LLM] Response received: "
            f"{len(response_text)} characters"
        )

        return response_text

    except HTTPException:
        raise

    except Exception as e:

        print(
            f"[LLM] Groq API Error: {str(e)}"
        )

        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to Groq API: {str(e)}"
        )


# =========================================================
# 7. JSON CLEANING / PARSING
# =========================================================

def parse_llm_json(response_text: str) -> dict:

    if not response_text:
        raise ValueError(
            "LLM returned an empty response."
        )

    text = response_text.strip()

    # Remove markdown fences if model accidentally adds them
    text = re.sub(
        r"^```(?:json)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r"\s*```$",
        "",
        text
    )

    text = text.strip()

    # Normal JSON
    try:
        return json.loads(text)

    except json.JSONDecodeError:
        pass

    # Try locating first { and last }
    first_brace = text.find("{")
    last_brace = text.rfind("}")

    if first_brace != -1 and last_brace != -1:

        candidate = text[
            first_brace:last_brace + 1
        ]

        try:
            return json.loads(candidate)

        except json.JSONDecodeError as e:

            print(
                "[ERROR] Unable to parse extracted JSON:"
            )
            print(candidate[:2000])

            raise ValueError(
                f"Invalid JSON returned by LLM: {e}"
            )

    raise ValueError(
        "LLM response did not contain a JSON object."
    )


# =========================================================
# 8. PDF TEXT EXTRACTION
# =========================================================

def extract_text_from_pdf(
    file_bytes: bytes
) -> str:

    extracted_text = ""

    try:

        reader = PdfReader(
            io.BytesIO(file_bytes)
        )

        print(
            f"[PDF] Pages detected: "
            f"{len(reader.pages)}"
        )

        for page_number, page in enumerate(
            reader.pages,
            start=1
        ):

            try:

                page_text = (
                    page.extract_text()
                    or ""
                )

                if page_text.strip():

                    extracted_text += (
                        page_text + "\n"
                    )

            except Exception as e:

                print(
                    f"[PDF] Error extracting "
                    f"page {page_number}: {e}"
                )

        print(
            f"[PDF] Normal extraction: "
            f"{len(extracted_text.strip())} characters"
        )

        # -------------------------------------------------
        # OCR FALLBACK
        # -------------------------------------------------

        # If PDF has little/no text, assume scanned PDF
        if len(extracted_text.strip()) < 100:

            if not PDF2IMAGE_AVAILABLE:

                print(
                    "[PDF OCR] pdf2image is not available."
                )

            else:

                print(
                    "[PDF OCR] Very little text found."
                )

                print(
                    "[PDF OCR] Starting OCR..."
                )

                try:

                    images = convert_from_bytes(
                        file_bytes,
                        dpi=200
                    )

                    print(
                        f"[PDF OCR] Converted "
                        f"{len(images)} pages to images."
                    )

                    ocr_text = ""

                    for page_number, image in enumerate(
                        images,
                        start=1
                    ):

                        print(
                            f"[PDF OCR] Processing "
                            f"page {page_number}..."
                        )

                        image = image.convert("L")

                        page_ocr = (
                            pytesseract.image_to_string(
                                image
                            )
                        )

                        if page_ocr.strip():

                            ocr_text += (
                                page_ocr + "\n"
                            )

                    if len(ocr_text.strip()) > len(
                        extracted_text.strip()
                    ):

                        extracted_text = ocr_text

                    print(
                        f"[PDF OCR] OCR extraction: "
                        f"{len(ocr_text.strip())} characters"
                    )

                except Exception as e:

                    print(
                        f"[PDF OCR ERROR] {str(e)}"
                    )

        return extracted_text.strip()

    except Exception as e:

        print(
            f"[PDF ERROR] {str(e)}"
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to read the PDF. "
                f"Error: {str(e)}"
            )
        )


# =========================================================
# 9. DOCX TEXT EXTRACTION
# =========================================================

def extract_text_from_docx(
    file_bytes: bytes
) -> str:

    try:

        document = docx.Document(
            io.BytesIO(file_bytes)
        )

        text_parts = []

        # Paragraphs
        for paragraph in document.paragraphs:

            if paragraph.text.strip():

                text_parts.append(
                    paragraph.text.strip()
                )

        # Tables
        for table in document.tables:

            for row in table.rows:

                row_text = []

                for cell in row.cells:

                    if cell.text.strip():

                        row_text.append(
                            cell.text.strip()
                        )

                if row_text:

                    text_parts.append(
                        " | ".join(row_text)
                    )

        text = "\n".join(text_parts)

        print(
            f"[DOCX] Extracted "
            f"{len(text)} characters"
        )

        return text.strip()

    except Exception as e:

        print(
            f"[DOCX ERROR] {str(e)}"
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid or corrupted DOCX file. "
                f"Error: {str(e)}"
            )
        )


# =========================================================
# 10. IMAGE OCR
# =========================================================

def extract_text_from_image(
    file_bytes: bytes
) -> str:

    try:

        image = Image.open(
            io.BytesIO(file_bytes)
        )

        print(
            f"[OCR] Image detected: "
            f"{image.size}, mode={image.mode}"
        )

        # Convert to grayscale
        image = image.convert("L")

        # OCR
        text = pytesseract.image_to_string(
            image,
            config="--psm 6"
        )

        print(
            f"[OCR] Extracted "
            f"{len(text.strip())} characters"
        )

        return text.strip()

    except Exception as e:

        print(
            f"[OCR ERROR] {str(e)}"
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to process the image "
                f"with OCR. Error: {str(e)}"
            )
        )


# =========================================================
# 11. TXT EXTRACTION
# =========================================================

def extract_text_from_txt(
    file_bytes: bytes
) -> str:

    encodings = [
        "utf-8",
        "utf-8-sig",
        "latin-1"
    ]

    for encoding in encodings:

        try:

            text = file_bytes.decode(
                encoding
            )

            print(
                f"[TXT] Successfully decoded "
                f"using {encoding}"
            )

            return text.strip()

        except UnicodeDecodeError:
            continue

    raise HTTPException(
        status_code=400,
        detail="Unable to decode TXT file."
    )


# =========================================================
# 12. GENERIC DOCUMENT EXTRACTION
# =========================================================

async def extract_document_text(
    file_bytes: bytes,
    file_ext: str
) -> str:

    print(
        f"[EXTRACT] Processing extension: "
        f"{file_ext}"
    )

    if file_ext == ".pdf":

        return extract_text_from_pdf(
            file_bytes
        )

    elif file_ext == ".docx":

        return extract_text_from_docx(
            file_bytes
        )

    elif file_ext == ".txt":

        return extract_text_from_txt(
            file_bytes
        )

    elif file_ext in {
        ".png",
        ".jpg",
        ".jpeg"
    }:

        return extract_text_from_image(
            file_bytes
        )

    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type. "
                "Allowed: PDF, DOCX, TXT, PNG, JPG, JPEG."
            )
        )


# =========================================================
# 13. AI SKILL EXTRACTION
# =========================================================

async def extract_skills_with_llm(
    text: str
) -> dict:

    if not text or len(text.strip()) < 10:

        return {
            "skills": [],
            "explanations": []
        }

    # Prevent unnecessarily huge prompts
    # 50,000 characters is plenty for a resume/document
    MAX_TEXT_FOR_LLM = 50000

    full_text = text[:MAX_TEXT_FOR_LLM]

    prompt = f"""
You are an expert technical recruiter and resume parser.

Your task is to extract EVERY identifiable skill,
technology, qualification, software, tool,
programming language, framework, methodology,
standard, domain skill, and professional competency
from the document below.

IMPORTANT RULES:

1. Be comprehensive.

2. Do NOT return zero skills unless the document
   genuinely contains no identifiable skills.

3. Extract individual skills separately.

For example:

Python
SQL
Power BI
Excel
Pandas

should be five separate skills.

4. Scan the ENTIRE document.

Look at:
- Summary
- Work experience
- Education
- Skills
- Certifications
- Projects
- Job descriptions
- Technical responsibilities
- Software
- Tools
- Technologies

5. Do not invent skills.

Only extract skills supported by the document.

6. If a skill appears multiple times,
return it only once.

7. Normalize obvious variations.

For example:
"Microsoft Excel" -> "Excel"

8. Keep domain-specific skills.

Examples:
- Electrical Power Distribution
- Data Analysis
- Project Management
- AutoCAD
- HSE Compliance

9. Use these categories:

- Programming Language
- Framework/Library
- Tool/Software
- Domain Knowledge
- Methodology/Standard
- Soft Skill
- Certification

10. Confidence must be between 0 and 1.

11. Provide evidence for every extracted skill.

RETURN ONLY THIS JSON STRUCTURE:

{{
  "skills": [
    {{
      "name": "Python",
      "category": "Programming Language",
      "confidence": 0.98
    }}
  ],
  "explanations": [
    {{
      "skill": "Python",
      "reasoning": "Python is explicitly listed in the document.",
      "evidence": "Python, SQL, Power BI"
    }}
  ]
}}

DOCUMENT TEXT:

{full_text}
"""

    try:

        llm_response = await llm_generate(
            prompt,
            max_tokens_override=4096
        )

        print(
            "[SKILLS] Raw LLM response:"
        )
        print(
            llm_response[:3000]
        )

        skills_data = parse_llm_json(
            llm_response
        )

        # Ensure expected structure
        if not isinstance(
            skills_data,
            dict
        ):

            raise ValueError(
                "LLM returned JSON but it was not an object."
            )

        skills = skills_data.get(
            "skills",
            []
        )

        explanations = skills_data.get(
            "explanations",
            []
        )

        if not isinstance(
            skills,
            list
        ):
            skills = []

        if not isinstance(
            explanations,
            list
        ):
            explanations = []

        print(
            f"[SKILLS] Successfully extracted "
            f"{len(skills)} skills."
        )

        return {
            "skills": skills,
            "explanations": explanations
        }

    except Exception as e:

        print(
            "[SKILLS ERROR]"
        )
        print(
            traceback.format_exc()
        )

        # IMPORTANT:
        # Do NOT silently return zero skills.
        raise HTTPException(
            status_code=502,
            detail=(
                "Document text was extracted successfully, "
                "but AI skill extraction failed. "
                f"Reason: {str(e)}"
            )
        )


# =========================================================
# 14. ROOT
# =========================================================

@app.get("/")
def read_root():

    return {
        "status": "Skills Pathfinder API is online.",
        "version": APP_VERSION,
        "supported_files": [
            "pdf",
            "docx",
            "txt",
            "png",
            "jpg",
            "jpeg"
        ]
    }


# =========================================================
# 15. UPLOAD DOCUMENT
# =========================================================

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    filename = file.filename or "unknown"

    print("=" * 70)
    print(
        f"[UPLOAD] File received: {filename}"
    )
    print("=" * 70)

    try:

        # -------------------------------------------------
        # Extension
        # -------------------------------------------------

        file_ext = os.path.splitext(
            filename
        )[1].lower()

        print(
            f"[UPLOAD] Extension: {file_ext}"
        )

        if file_ext not in ALLOWED_EXTENSIONS:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported file type. "
                    "Allowed files: "
                    "PDF, DOCX, TXT, PNG, JPG, JPEG."
                )
            )

        # -------------------------------------------------
        # Read file
        # -------------------------------------------------

        file_bytes = await file.read()

        file_size = len(file_bytes)

        print(
            f"[UPLOAD] File size: "
            f"{file_size / 1024:.2f} KB"
        )

        if file_size == 0:

            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty."
            )

        if file_size > MAX_FILE_SIZE:

            raise HTTPException(
                status_code=400,
                detail=(
                    "File size exceeds the "
                    "15 MB limit."
                )
            )

        # -------------------------------------------------
        # Extract text
        # -------------------------------------------------

        print(
            "[UPLOAD] Starting text extraction..."
        )

        text = await extract_document_text(
            file_bytes,
            file_ext
        )

        character_count = len(
            text.strip()
        )

        print(
            f"[UPLOAD] Extracted text: "
            f"{character_count} characters"
        )

        # -------------------------------------------------
        # Text validation
        # -------------------------------------------------

        if character_count < 10:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract meaningful text "
                    "from this document. "
                    "For scanned PDFs/images, make sure "
                    "the document is clear enough for OCR."
                )
            )

        # -------------------------------------------------
        # AI extraction
        # -------------------------------------------------

        print(
            "[UPLOAD] Sending text to AI..."
        )

        skills_data = (
            await extract_skills_with_llm(
                text
            )
        )

        skills = skills_data.get(
            "skills",
            []
        )

        explanations = skills_data.get(
            "explanations",
            []
        )

        print(
            f"[UPLOAD] Skills found: "
            f"{len(skills)}"
        )

        # -------------------------------------------------
        # Recommendations
        # -------------------------------------------------

        try:

            recommendations = (
                get_career_recommendations(
                    skills,
                    top_n=5
                )
            )

        except Exception as e:

            print(
                f"[RECOMMENDATION WARNING] "
                f"{str(e)}"
            )

            recommendations = []

        # -------------------------------------------------
        # Response
        # -------------------------------------------------

        return {
            "message": "File processed successfully",
            "filename": filename,
            "file_type": file_ext,
            "character_count": character_count,
            "extracted_skills": skills,
            "explanations": explanations,
            "recommendations": recommendations
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "[UPLOAD ERROR]"
        )
        print(
            traceback.format_exc()
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    "Server error processing file: "
                    f"{str(e)}"
                )
            }
        )


# =========================================================
# 16. CERTIFICATE VERIFICATION
# =========================================================

@app.post("/api/verify-certificate")
async def verify_certificate(
    file: UploadFile = File(...)
):

    try:

        filename = file.filename or "certificate"

        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE:

            raise HTTPException(
                status_code=400,
                detail="File exceeds 15 MB limit."
            )

        file_ext = os.path.splitext(
            filename
        )[1].lower()

        if file_ext not in {
            ".pdf",
            ".png",
            ".jpg",
            ".jpeg"
        }:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported certificate file. "
                    "Use PDF, PNG, JPG, or JPEG."
                )
            )

        text = await extract_document_text(
            file_bytes,
            file_ext
        )

        if len(text.strip()) < 10:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract certificate text."
                )
            )

        prompt = f"""
Extract certificate information from the text below.

Return ONLY valid JSON.

Required structure:

{{
  "certification_name": "",
  "provider": "",
  "credential_id": "",
  "verification_url": ""
}}

Rules:

- Do not invent information.
- If information is not present, use an empty string.
- Look carefully for credential IDs.
- Look for verification URLs.

Certificate Text:

{text[:30000]}
"""

        llm_response = await llm_generate(
            prompt,
            max_tokens_override=1024
        )

        cert_data = parse_llm_json(
            llm_response
        )

        if not cert_data.get(
            "certification_name"
        ):

            cert_data[
                "certification_name"
            ] = os.path.splitext(
                filename
            )[0]

        if not cert_data.get(
            "provider"
        ):

            cert_data[
                "provider"
            ] = "Unknown"

        verification_url = (
            cert_data.get(
                "verification_url",
                ""
            )
        )

        if verification_url:

            if re.search(
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
                verification_url,
                re.IGNORECASE
            ):

                cert_data[
                    "auto_verified"
                ] = True

            else:

                cert_data[
                    "auto_verified"
                ] = False

        else:

            cert_data[
                "auto_verified"
            ] = False

        return cert_data

    except HTTPException:
        raise

    except Exception as e:

        print(
            "[CERTIFICATE ERROR]"
        )

        print(
            traceback.format_exc()
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error processing certificate: {str(e)}"
            )
        )


# =========================================================
# 17. SKILLS REQUEST
# =========================================================

class SkillsRequest(BaseModel):

    extracted_skills: List[
        Dict[str, Any]
    ]


# =========================================================
# 18. RECOMMENDATIONS
# =========================================================

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

    except HTTPException:
        raise

    except Exception as e:

        print(
            "[RECOMMENDATION ERROR]"
        )

        print(
            traceback.format_exc()
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Error generating recommendations: "
                f"{str(e)}"
            )
        )


# =========================================================
# 19. CAREER PATHS
# =========================================================

@app.get("/api/career-paths")
async def get_all_career_paths():

    from recommendation_engine import (
        CAREER_PATHS
    )

    career_list = [

        {
            "id": career["id"],
            "path": career["path"],
            "category": career["category"],
            "job_outlook": career["job_outlook"],
            "median_salary": career["median_salary"]
        }

        for career in CAREER_PATHS
    ]

    return {
        "status": "success",
        "career_paths": career_list
    }


# =========================================================
# 20. SKILL GAP ANALYSIS
# =========================================================

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
            "[SKILL GAP ERROR]"
        )

        print(
            traceback.format_exc()
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Error analyzing skill gap: "
                f"{str(e)}"
            )
        )


# =========================================================
# 21. DEBUG ENVIRONMENT
# =========================================================

@app.get("/debug-env")
def debug_env():

    return {
        "groq_key_set": bool(
            os.getenv("GROQ_API_KEY")
        ),

        "groq_model": GROQ_MODEL,

        "supabase_configured": bool(
            os.getenv("SUPABASE_URL")
            and os.getenv("SUPABASE_KEY")
        ),

        "tesseract_cmd": TESSERACT_CMD,

        "pdf2image_available":
            PDF2IMAGE_AVAILABLE,

        "supported_files": sorted(
            list(ALLOWED_EXTENSIONS)
        )
    }


# =========================================================
# 22. CAREER ADVICE
# =========================================================

class ReportRequest(BaseModel):

    skills: List[str]


@app.post("/api/generate-career-advice")
async def generate_career_advice(
    request: ReportRequest
):

    try:

        skills_text = (
            ", ".join(request.skills)
            if request.skills
            else "No skills provided"
        )

        prompt = f"""
You are an expert Career Coach and Talent Analyst.

Based on the following candidate skills:

[{skills_text}]

Generate a comprehensive career report.

Return ONLY valid JSON.

Required structure:

{{
  "executive_summary": "A professional 2-3 sentence summary.",
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
"""

        llm_response = await llm_generate(
            prompt,
            max_tokens_override=2048
        )

        advice_data = parse_llm_json(
            llm_response
        )

        return {
            "status": "success",
            "advice": advice_data
        }

    except HTTPException:
        raise

    except Exception as e:

        print(
            "[CAREER ADVICE ERROR]"
        )

        print(
            traceback.format_exc()
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Error generating career advice: "
                f"{str(e)}"
            )
        )


# =========================================================
# 23. STARTUP MESSAGE
# =========================================================

print("=" * 70)
print("Skills Pathfinder Backend")
print(f"Version: {APP_VERSION}")
print(f"Groq Model: {GROQ_MODEL}")
print(
    f"Groq Configured: {bool(GROQ_API_KEY)}"
)
print(
    f"Supabase Configured: "
    f"{bool(SUPABASE_URL and SUPABASE_KEY)}"
)
print(
    f"PDF OCR Available: "
    f"{PDF2IMAGE_AVAILABLE}"
)
print(
    f"Tesseract Command: "
    f"{TESSERACT_CMD}"
)
print(
    "Supported Files: "
    "PDF, DOCX, TXT, PNG, JPG, JPEG"
)
print("=" * 70)
