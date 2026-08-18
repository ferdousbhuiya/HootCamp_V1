# main.py
# Skills Pathfinder Backend
# Robust document extraction + OCR + Groq skill analysis

import os
import io
import json
import re
import traceback
import zipfile
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
from PyPDF2 import PdfReader
import pdfplumber
import pytesseract
import docx

from PIL import Image

from groq import Groq
from pydantic import BaseModel

from supabase import create_client, Client

# Optional scanned PDF OCR
try:
    from pdf2image import convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except Exception:
    PDF2IMAGE_AVAILABLE = False


# ============================================================
# 1. LOAD ENVIRONMENT
# ============================================================

load_dotenv()

print("=" * 70)
print("SKILLS PATHFINDER BACKEND STARTING")
print("=" * 70)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "llama-3.3-70b-versatile"
)

TESSERACT_CMD = os.getenv("TESSERACT_CMD", "tesseract")

try:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
except Exception:
    pass

print(f"[CONFIG] GROQ_MODEL = {GROQ_MODEL}")
print(f"[CONFIG] GROQ_API_KEY configured = {bool(GROQ_API_KEY)}")
print(f"[CONFIG] TESSERACT_CMD = {TESSERACT_CMD}")
print(f"[CONFIG] PDF2IMAGE_AVAILABLE = {PDF2IMAGE_AVAILABLE}")


# ============================================================
# 2. FASTAPI
# ============================================================

app = FastAPI(
    title="Skills Pathfinder API",
    version="1.1.0",
    description="Backend API for Skills Pathfinder"
)


# ============================================================
# 3. CORS
# ============================================================

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


# ============================================================
# 4. SUPABASE
# ============================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client

    if _supabase_client is None:

        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be configured"
            )

        _supabase_client = create_client(
            SUPABASE_URL,
            SUPABASE_KEY
        )

    return _supabase_client


# ============================================================
# 5. GROQ CLIENT
# ============================================================

groq_client = None

if GROQ_API_KEY:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        print("[OK] Groq client initialized")
    except Exception as e:
        print(f"[ERROR] Could not initialize Groq: {e}")
else:
    print("[ERROR] GROQ_API_KEY is missing")


async def llm_generate(
    prompt: str,
    max_tokens_override: int = 4096
):

    if not groq_client:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured on the backend."
        )

    try:

        print(
            f"[LLM] Calling Groq model: {GROQ_MODEL}"
        )

        completion = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert resume and skills analyzer. "
                        "When JSON is requested, return ONLY valid JSON. "
                        "Never return markdown fences."
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
            completion.choices[0]
            .message
            .content
        )

        if response_text is None:
            raise ValueError("Groq returned an empty response")

        print(
            f"[LLM] Response length: {len(response_text)}"
        )

        print(
            f"[LLM] Response preview: "
            f"{response_text[:500]}"
        )

        return response_text

    except HTTPException:
        raise

    except Exception as e:

        print(
            f"[LLM] Groq API ERROR: {str(e)}"
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=502,
            detail=f"Failed to connect to Groq API: {str(e)}"
        )


# ============================================================
# 6. OCR HELPER
# ============================================================

def run_ocr(image: Image.Image) -> str:

    try:

        print(
            f"[OCR] Processing image "
            f"{image.size}"
        )

        # Convert to RGB first
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Grayscale
        gray = image.convert("L")

        # OCR
        text = pytesseract.image_to_string(
            gray,
            config="--psm 6"
        )

        print(
            f"[OCR] Extracted {len(text)} characters"
        )

        return text or ""

    except Exception as e:

        print(
            f"[OCR ERROR] {str(e)}"
        )

        traceback.print_exc()

        return ""


# ============================================================
# 7. PDF EXTRACTION
# ============================================================

def extract_text_from_pdf(file_bytes: bytes) -> str:

    extracted_parts = []

    # --------------------------------------------------------
    # Method 1: PyPDF2
    # --------------------------------------------------------

    try:

        print("[PDF] Trying PyPDF2 extraction")

        reader = PdfReader(
            io.BytesIO(file_bytes)
        )

        print(
            f"[PDF] Pages: {len(reader.pages)}"
        )

        for page_number, page in enumerate(
            reader.pages,
            start=1
        ):

            try:

                page_text = (
                    page.extract_text() or ""
                )

                if page_text.strip():

                    extracted_parts.append(
                        page_text
                    )

                    print(
                        f"[PDF] Page {page_number}: "
                        f"{len(page_text)} chars"
                    )

            except Exception as e:

                print(
                    f"[PDF] Page {page_number} "
                    f"PyPDF2 error: {e}"
                )

    except Exception as e:

        print(
            f"[PDF] PyPDF2 failed: {e}"
        )


    # --------------------------------------------------------
    # Method 2: pdfplumber
    # --------------------------------------------------------

    if sum(
        len(x) for x in extracted_parts
    ) < 1000:

        try:

            print(
                "[PDF] Trying pdfplumber extraction"
            )

            with pdfplumber.open(
                io.BytesIO(file_bytes)
            ) as pdf:

                plumber_parts = []

                for page_number, page in enumerate(
                    pdf.pages,
                    start=1
                ):

                    try:

                        page_text = (
                            page.extract_text() or ""
                        )

                        if page_text.strip():

                            plumber_parts.append(
                                page_text
                            )

                            print(
                                f"[PDFPLUMBER] Page "
                                f"{page_number}: "
                                f"{len(page_text)} chars"
                            )

                    except Exception as e:

                        print(
                            f"[PDFPLUMBER] "
                            f"Page {page_number}: "
                            f"{e}"
                        )

                plumber_text = "\n".join(
                    plumber_parts
                )

                if len(plumber_text.strip()) > sum(
                    len(x) for x in extracted_parts
                ):

                    extracted_parts = [
                        plumber_text
                    ]

        except Exception as e:

            print(
                f"[PDFPLUMBER] Failed: {e}"
            )


    text = "\n".join(
        extracted_parts
    ).strip()


    # --------------------------------------------------------
    # OCR FALLBACK
    # --------------------------------------------------------

    # Important:
    # A scanned resume may produce a few characters
    # even though the page is actually an image.
    #
    # Therefore OCR is triggered below 1000 characters.

    if len(text) < 1000:

        print(
            f"[PDF] Only {len(text)} characters found."
        )

        if not PDF2IMAGE_AVAILABLE:

            print(
                "[PDF OCR] pdf2image is not available"
            )

        else:

            try:

                print(
                    "[PDF OCR] Converting PDF "
                    "pages to images..."
                )

                images = convert_from_bytes(
                    file_bytes,
                    dpi=200
                )

                print(
                    f"[PDF OCR] Converted "
                    f"{len(images)} pages"
                )

                ocr_parts = []

                for page_number, image in enumerate(
                    images,
                    start=1
                ):

                    print(
                        f"[PDF OCR] OCR page "
                        f"{page_number}"
                    )

                    page_text = run_ocr(
                        image
                    )

                    if page_text.strip():

                        ocr_parts.append(
                            page_text
                        )

                ocr_text = "\n".join(
                    ocr_parts
                ).strip()

                print(
                    f"[PDF OCR] Total OCR text: "
                    f"{len(ocr_text)} characters"
                )

                # Use OCR if it gives more text
                if len(ocr_text) > len(text):

                    text = ocr_text

            except Exception as e:

                print(
                    f"[PDF OCR ERROR] {str(e)}"
                )

                traceback.print_exc()


    print(
        f"[PDF] FINAL extracted text: "
        f"{len(text)} characters"
    )

    return text


# ============================================================
# 8. DOCX EXTRACTION
# ============================================================

def extract_text_from_docx(
    file_bytes: bytes
) -> str:

    parts = []

    try:

        print("[DOCX] Opening document")

        document = docx.Document(
            io.BytesIO(file_bytes)
        )

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

                row_text = []

                for cell in row.cells:

                    cell_text = cell.text.strip()

                    if cell_text:
                        row_text.append(
                            cell_text
                        )

                if row_text:

                    parts.append(
                        " | ".join(row_text)
                    )


        # ----------------------------------------------------
        # Embedded images
        # ----------------------------------------------------

        # Some resumes are DOCX files where the actual
        # content is inside screenshots/images.

        try:

            with zipfile.ZipFile(
                io.BytesIO(file_bytes)
            ) as z:

                image_files = [
                    name
                    for name in z.namelist()
                    if name.startswith(
                        "word/media/"
                    )
                ]

                print(
                    f"[DOCX] Embedded images: "
                    f"{len(image_files)}"
                )

                for image_name in image_files:

                    try:

                        image_data = z.read(
                            image_name
                        )

                        image = Image.open(
                            io.BytesIO(image_data)
                        )

                        ocr_text = run_ocr(
                            image
                        )

                        if ocr_text.strip():

                            parts.append(
                                ocr_text
                            )

                    except Exception as e:

                        print(
                            f"[DOCX OCR] "
                            f"{image_name}: {e}"
                        )

        except Exception as e:

            print(
                f"[DOCX] Image extraction error: "
                f"{e}"
            )


        final_text = "\n".join(parts).strip()

        print(
            f"[DOCX] FINAL text: "
            f"{len(final_text)} characters"
        )

        return final_text

    except Exception as e:

        print(
            f"[DOCX ERROR] {str(e)}"
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted DOCX file."
        )


# ============================================================
# 9. IMAGE EXTRACTION
# ============================================================

def extract_text_from_image(
    file_bytes: bytes
) -> str:

    try:

        print("[IMAGE] Opening image")

        image = Image.open(
            io.BytesIO(file_bytes)
        )

        text = run_ocr(image)

        print(
            f"[IMAGE] Extracted "
            f"{len(text)} characters"
        )

        return text.strip()

    except Exception as e:

        print(
            f"[IMAGE ERROR] {str(e)}"
        )

        traceback.print_exc()

        raise HTTPException(
            status_code=400,
            detail="Invalid or corrupted image file."
        )


# ============================================================
# 10. TEXT FILE
# ============================================================

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

            return text.strip()

        except UnicodeDecodeError:
            continue

    return ""


# ============================================================
# 11. LOCAL SKILL FALLBACK
# ============================================================

COMMON_SKILLS = [

    # Programming
    "Python",
    "Java",
    "JavaScript",
    "TypeScript",
    "C",
    "C++",
    "C#",
    "R",
    "SQL",
    "HTML",
    "CSS",
    "PHP",

    # Data
    "Pandas",
    "NumPy",
    "Scikit-learn",
    "TensorFlow",
    "PyTorch",
    "Power BI",
    "Tableau",
    "Excel",
    "Power Query",
    "DAX",
    "Data Analytics",
    "Data Analysis",
    "Machine Learning",
    "Deep Learning",
    "Data Visualization",

    # Cloud
    "AWS",
    "Azure",
    "Google Cloud",
    "GCP",

    # Databases
    "MySQL",
    "PostgreSQL",
    "SQL Server",
    "Oracle",
    "MongoDB",

    # Web / frameworks
    "FastAPI",
    "Django",
    "Flask",
    "React",
    "Node.js",

    # Tools
    "Git",
    "GitHub",
    "Docker",
    "Linux",
    "Jenkins",

    # Engineering
    "AutoCAD",
    "MATLAB",
    "Electrical Engineering",
    "Electrical Design",
    "Power Distribution",
    "Power Systems",
    "Solar",
    "Renewable Energy",
    "Project Management",

    # Business
    "QuickBooks",
    "Microsoft Office",
    "Word",
    "PowerPoint",
    "Outlook"
]


def local_skill_fallback(
    text: str
) -> List[Dict[str, Any]]:

    skills = []

    text_lower = text.lower()

    for skill in COMMON_SKILLS:

        if skill.lower() in text_lower:

            if skill in [
                "Python",
                "Java",
                "JavaScript",
                "TypeScript",
                "C",
                "C++",
                "C#",
                "R",
                "SQL",
                "HTML",
                "CSS",
                "PHP"
            ]:

                category = "Programming Language"

            elif skill in [
                "Pandas",
                "NumPy",
                "Scikit-learn",
                "TensorFlow",
                "PyTorch",
                "FastAPI",
                "Django",
                "Flask",
                "React",
                "Node.js"
            ]:

                category = "Framework/Library"

            elif skill in [
                "Power BI",
                "Tableau",
                "Excel",
                "Power Query",
                "DAX",
                "AutoCAD",
                "MATLAB",
                "Git",
                "GitHub",
                "Docker",
                "Jenkins",
                "QuickBooks",
                "Microsoft Office",
                "Word",
                "PowerPoint",
                "Outlook"
            ]:

                category = "Tool/Software"

            elif skill in [
                "Machine Learning",
                "Deep Learning",
                "Data Analytics",
                "Data Analysis",
                "Data Visualization",
                "Electrical Engineering",
                "Electrical Design",
                "Power Distribution",
                "Power Systems",
                "Solar",
                "Renewable Energy",
                "Project Management"
            ]:

                category = "Domain Knowledge"

            else:

                category = "Technical Skill"

            skills.append(
                {
                    "name": skill,
                    "category": category,
                    "confidence": 0.70
                }
            )

    return skills


# ============================================================
# 12. GROQ SKILL EXTRACTION
# ============================================================

async def extract_skills_with_llm(
    text: str
) -> dict:

    # Limit extremely large documents so that
    # the model receives a manageable prompt.

    MAX_TEXT = 50000

    full_text = text[:MAX_TEXT]

    print(
        f"[SKILLS] Sending "
        f"{len(full_text)} characters to Groq"
    )

    prompt = f"""
You are an expert technical recruiter and resume parser.

Analyze the following document and extract EVERY skill,
technology, software, programming language, framework,
domain skill, methodology, standard, certification and
important professional competency.

IMPORTANT RULES:

1. Extract skills explicitly mentioned in the document.
2. Do NOT return an empty list if skills are clearly present.
3. Scan the ENTIRE document.
4. Look at:
   - Summary
   - Skills
   - Work Experience
   - Education
   - Certifications
   - Projects
   - Job descriptions
   - Tables
5. Extract individual technologies separately.
6. Do not combine Python, SQL and Power BI into "Data Analytics".
7. If "Microsoft Excel" appears, extract Excel.
8. If "Power BI" appears, extract Power BI.
9. If "AutoCAD" appears, extract AutoCAD.
10. If "Electrical Power Distribution" appears, extract it.
11. Do not invent skills that are not supported by the document.

Use these categories:

- Programming Language
- Framework/Library
- Tool/Software
- Domain Knowledge
- Methodology/Standard
- Soft Skill
- Certification

Return ONLY this JSON structure:

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
      "reasoning": "Python is explicitly mentioned in the document.",
      "evidence": "Exact relevant text from the document."
    }}
  ]
}}

DOCUMENT:

{full_text}
"""

    try:

        response = await llm_generate(
            prompt,
            max_tokens_override=4096
        )

        print(
            f"[SKILLS] Raw Groq response:"
        )

        print(
            response[:2000]
        )

        # Clean accidental markdown
        response = response.strip()

        if response.startswith(
            "```json"
        ):

            response = response[
                7:
            ].strip()

        if response.endswith(
            "```"
        ):

            response = response[
                :-3
            ].strip()

        skills_data = json.loads(
            response
        )

        if not isinstance(
            skills_data,
            dict
        ):

            raise ValueError(
                "Groq response is not a JSON object"
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
            f"[SKILLS] Groq extracted "
            f"{len(skills)} skills"
        )

        # ----------------------------------------------------
        # Local fallback if Groq returns nothing
        # ----------------------------------------------------

        if len(skills) == 0:

            print(
                "[SKILLS] Groq returned ZERO skills."
            )

            print(
                "[SKILLS] Running local skill fallback..."
            )

            fallback_skills = (
                local_skill_fallback(
                    full_text
                )
            )

            if fallback_skills:

                skills = fallback_skills

                explanations = [
                    {
                        "skill": item["name"],
                        "reasoning": (
                            "Skill detected by "
                            "local document analysis."
                        ),
                        "evidence": item["name"]
                    }
                    for item in fallback_skills
                ]

                print(
                    f"[SKILLS] Local fallback found "
                    f"{len(skills)} skills"
                )

        return {
            "skills": skills,
            "explanations": explanations
        }

    except json.JSONDecodeError as e:

        print(
            f"[SKILLS] JSON parsing failed: {e}"
        )

        print(
            "[SKILLS] Running local fallback"
        )

        fallback_skills = (
            local_skill_fallback(
                full_text
            )
        )

        return {
            "skills": fallback_skills,
            "explanations": [
                {
                    "skill": item["name"],
                    "reasoning": (
                        "Detected by local "
                        "fallback analysis."
                    ),
                    "evidence": item["name"]
                }
                for item in fallback_skills
            ]
        }

    except Exception as e:

        print(
            f"[SKILLS] LLM processing error: "
            f"{str(e)}"
        )

        traceback.print_exc()

        fallback_skills = (
            local_skill_fallback(
                full_text
            )
        )

        return {
            "skills": fallback_skills,
            "explanations": [
                {
                    "skill": item["name"],
                    "reasoning": (
                        "Detected by local "
                        "fallback analysis."
                    ),
                    "evidence": item["name"]
                }
                for item in fallback_skills
            ]
        }


# ============================================================
# 13. ROOT
# ============================================================

@app.get("/")
def read_root():

    return {
        "status": "Skills Pathfinder API is online.",
        "version": "1.1.0"
    }


# ============================================================
# 14. UPLOAD DOCUMENT
# ============================================================

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...)
):

    try:

        # ----------------------------------------------------
        # Supported files
        # ----------------------------------------------------

        allowed_extensions = {
            ".pdf",
            ".docx",
            ".png",
            ".jpeg",
            ".jpg",
            ".txt"
        }

        filename = (
            file.filename
            or "unknown"
        )

        file_ext = os.path.splitext(
            filename
        )[1].lower()

        print("=" * 70)

        print(
            f"[UPLOAD] File: {filename}"
        )

        print(
            f"[UPLOAD] Extension: {file_ext}"
        )


        if file_ext not in allowed_extensions:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported file type. "
                    "Allowed: PDF, DOCX, PNG, "
                    "JPG, JPEG, TXT"
                )
            )


        # ----------------------------------------------------
        # Read file
        # ----------------------------------------------------

        file_bytes = await file.read()

        file_size = len(
            file_bytes
        )

        print(
            f"[UPLOAD] File size: "
            f"{file_size} bytes"
        )


        if file_size == 0:

            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty."
            )


        if file_size > (
            15 * 1024 * 1024
        ):

            raise HTTPException(
                status_code=400,
                detail=(
                    "File size exceeds "
                    "15MB limit."
                )
            )


        # ----------------------------------------------------
        # Extract text
        # ----------------------------------------------------

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

        elif file_ext in {
            ".png",
            ".jpg",
            ".jpeg"
        }:

            text = extract_text_from_image(
                file_bytes
            )

        else:

            text = ""


        text = text.strip()

        print(
            f"[UPLOAD] FINAL extracted text: "
            f"{len(text)} characters"
        )

        print(
            f"[UPLOAD] Text preview:"
        )

        print(
            text[:1000]
        )


        # ----------------------------------------------------
        # Validate extraction
        # ----------------------------------------------------

        if not text or len(
            text.strip()
        ) < 10:

            return JSONResponse(
                status_code=400,
                content={
                    "detail": (
                        "Could not extract meaningful "
                        "text from this document. "
                        "The file may be blank, "
                        "image-only, encrypted, "
                        "or unreadable."
                    ),
                    "filename": filename,
                    "character_count": len(text)
                }
            )


        # ----------------------------------------------------
        # LLM skill analysis
        # ----------------------------------------------------

        print(
            "[UPLOAD] Starting skill analysis..."
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


        # ----------------------------------------------------
        # Career recommendations
        # ----------------------------------------------------

        try:

            recommendations = (
                get_career_recommendations(
                    skills,
                    top_n=5
                )
            )

        except Exception as e:

            print(
                f"[RECOMMENDATION ERROR] "
                f"{e}"
            )

            recommendations = []


        print(
            f"[UPLOAD] FINAL skills: "
            f"{len(skills)}"
        )

        print("=" * 70)


        return {
            "message": "File processed successfully",
            "filename": filename,
            "extracted_skills": skills,
            "explanations": skills_data.get(
                "explanations",
                []
            ),
            "recommendations": recommendations,
            "character_count": len(text),
            "text_preview": text[:500]
        }


    except HTTPException:
        raise

    except Exception as e:

        traceback.print_exc()

        print(
            f"[UPLOAD ERROR] {str(e)}"
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    f"Server error processing "
                    f"file: {str(e)}"
                ),
                "partial": True
            }
        )


# ============================================================
# 15. CERTIFICATE VERIFICATION
# ============================================================

@app.post("/api/verify-certificate")
async def verify_certificate(
    file: UploadFile = File(...)
):

    try:

        file_bytes = await file.read()

        filename = (
            file.filename
            or "certificate"
        )

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

        else:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported certificate "
                    "file. Use PDF, PNG, JPG "
                    "or JPEG."
                )
            )


        if not text.strip():

            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract text "
                    "from certificate."
                )
            )


        prompt = f"""
Extract certificate information from the text below.

Return ONLY JSON:

{{
  "certification_name": "",
  "provider": "",
  "credential_id": "",
  "verification_url": ""
}}

Certificate text:

{text}
"""


        llm_response = await llm_generate(
            prompt,
            max_tokens_override=1024
        )

        cert_data = json.loads(
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
                "verification_url"
            )
            or ""
        )


        if verification_url:

            if re.search(
                r"""
                (
                    aws\.amazon\.com|
                    coursera\.org|
                    udemy\.com|
                    edx\.org|
                    google\.com|
                    microsoft\.com|
                    cisco\.com|
                    comptia\.org|
                    credly\.com|
                    credential\.net
                )
                """,
                verification_url,
                re.IGNORECASE |
                re.VERBOSE
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

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error processing "
                f"certificate: {str(e)}"
            )
        )


# ============================================================
# 16. SKILLS REQUEST
# ============================================================

class SkillsRequest(BaseModel):

    extracted_skills: List[
        Dict[str, Any]
    ]


# ============================================================
# 17. RECOMMENDATIONS
# ============================================================

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

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error generating "
                f"recommendations: {str(e)}"
            )
        )


# ============================================================
# 18. CAREER PATHS
# ============================================================

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


# ============================================================
# 19. SKILL GAP ANALYSIS
# ============================================================

@app.post("/api/skill-gap-analysis")
async def skill_gap_analysis(
    skills_request: SkillsRequest,
    career_id: str
):

    try:

        from recommendation_engine import (
            get_skill_gap_analysis
        )

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

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error analyzing "
                f"skill gap: {str(e)}"
            )
        )


# ============================================================
# 20. DEBUG ENVIRONMENT
# ============================================================

@app.get("/debug-env")
def debug_env():

    return {

        "groq_key_set": bool(
            os.getenv("GROQ_API_KEY")
        ),

        "groq_model": GROQ_MODEL,

        "supabase_configured": bool(
            os.getenv("SUPABASE_URL")
            and
            os.getenv("SUPABASE_KEY")
        ),

        "tesseract_command": TESSERACT_CMD,

        "pdf2image_available":
            PDF2IMAGE_AVAILABLE

    }


# ============================================================
# 21. CAREER ADVICE
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
        )

        if not skills_text:

            skills_text = (
                "No skills provided"
            )


        prompt = f"""
You are an expert Career Coach and Talent Analyst.

Based on these skills:

[{skills_text}]

Generate a comprehensive career report.

Return ONLY valid JSON.

Required structure:

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
"""


        llm_response = await llm_generate(
            prompt,
            max_tokens_override=2048
        )

        advice_data = json.loads(
            llm_response
        )


        return {
            "status": "success",
            "advice": advice_data
        }


    except HTTPException:
        raise

    except Exception as e:

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Error generating "
                f"career advice: {str(e)}"
            )
        )


# ============================================================
# END
# ============================================================

print("=" * 70)
print("SKILLS PATHFINDER BACKEND READY")
print("=" * 70)
