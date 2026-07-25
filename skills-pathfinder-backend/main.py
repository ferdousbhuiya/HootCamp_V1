# main.py

import os
import io
import json
import re  # Added for regex in certificate verification
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv
from PyPDF2 import PdfReader
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
from recommendation_engine import get_career_recommendations, get_skill_gap_analysis
from pydantic import BaseModel
from typing import List, Dict, Any
import docx
from PIL import Image
from groq import Groq

# For scanned PDFs (Optional fallback)
try:
    from pdf2image import convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False

# ==========================================
# 1. CONFIGURATION & INITIALIZATION
# ==========================================

load_dotenv()

app = FastAPI(
    title="Skills Pathfinder API",
    version="1.0.0",
    description="Backend API for the Skills Pathfinder Master's Project"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# LLM Client (Groq API - Optimized for JSON)
# ==========================================

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile") # Updated to the active model

groq_client = Groq(api_key=GROQ_API_KEY)

async def llm_generate(prompt: str, max_tokens_override: int = 4096):
    try:
        print(f"🔵 Calling Groq API ({GROQ_MODEL})...")
        
        completion = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a strict JSON generator. You must output ONLY valid JSON. Do not include markdown formatting, explanations, or any text outside the JSON object."
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
        print(f"📝 Raw LLM Response Length: {len(response_text)} chars")
        return response_text

    except Exception as e:
        print(f"❌ Groq API Error: {str(e)}")
        raise HTTPException(status_code=502, detail=f"Failed to connect to Groq API: {str(e)}")

# ==========================================
# 2. HELPER FUNCTIONS (FILE PROCESSING & OCR)
# ==========================================

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extracts text from PDF. Falls back to OCR if it's a scanned PDF."""
    text = ""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
        
        if len(text.strip()) < 100 and PDF2IMAGE_AVAILABLE:
            print("⚠️ Very little text found. Attempting OCR for scanned PDF...")
            images = convert_from_bytes(file_bytes)
            for img in images:
                text += pytesseract.image_to_string(img) + "\n"
        elif len(text.strip()) < 100:
            print("⚠️ Very little text found. Install 'pdf2image' and 'poppler' for scanned PDF OCR support.")
            
    except Exception as e:
        print(f"Error reading PDF: {e}")
        raise HTTPException(status_code=400, detail="Invalid or corrupted PDF file.")
    return text

def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extracts text from a .docx file."""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join([para.text for para in doc.paragraphs])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted DOCX file.")

def extract_text_from_image(file_bytes: bytes) -> str:
    """Extracts text from an image using Tesseract OCR."""
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image = image.convert("L") # Convert to grayscale for better OCR accuracy
        return pytesseract.image_to_string(image)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted image file.")

# ==========================================
# 3. API ENDPOINTS
# ==========================================

@app.get("/")
def read_root():
    return {"status": "Skills Pathfinder API is online."}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    # 1. Validate file extension (Added .txt)
    allowed_extensions = {".pdf", ".docx", ".png", ".jpeg", ".jpg", ".txt"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}")

    # 2. Read file bytes (Increased to 15MB safety limit)
    file_bytes = await file.read()
    if len(file_bytes) > 15 * 1024 * 1024: 
        raise HTTPException(status_code=400, detail="File size exceeds 15MB limit.")

    # 3. Extract text based on file type
    try:
        if file_ext == ".pdf":
            text = extract_text_from_pdf(file_bytes)
        elif file_ext == ".docx":
            text = extract_text_from_docx(file_bytes)
        elif file_ext == ".txt":
            text = file_bytes.decode("utf-8")
        else: # .png, .jpeg, .jpg
            text = extract_text_from_image(file_bytes)
            
        if not text or len(text.strip()) < 10:
            raise HTTPException(status_code=400, detail="Could not extract meaningful text. File might be blank or unreadable.")

        # 4. Process with LLM
        skills_data = await extract_skills_with_llm(text)
        skills = skills_data.get("skills", [])

        # 5. Generate career recommendations from extracted skills
        recommendations = get_career_recommendations(skills, top_n=5)

        return {
            "message": "File processed successfully",
            "filename": file.filename,
            "extracted_skills": skills,
            "explanations": skills_data.get("explanations", []),
            "recommendations": recommendations,
            "character_count": len(text)
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Unexpected error processing file: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

# ==========================================
# NEW: CERTIFICATE VERIFICATION ENDPOINT
# ==========================================

@app.post("/api/verify-certificate")
async def verify_certificate(file: UploadFile = File(...)):
    """
    Extract certificate details using OCR and attempt auto-verification
    """
    try:
        file_bytes = await file.read()
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        # Extract text based on file type
        if file_ext == '.pdf':
            text = extract_text_from_pdf(file_bytes)
        elif file_ext in ['.png', '.jpg', '.jpeg']:
            text = extract_text_from_image(file_bytes)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type for certificate. Use PDF, PNG, or JPG.")
        
        # Use LLM to extract certificate details
        prompt = f"""
Extract the following information from this certificate text:
1. Certification name (e.g., "AWS Certified Solutions Architect")
2. Provider/Organization (e.g., "Amazon Web Services", "Google", "Microsoft")
3. Credential ID or Certificate Number (if present)
4. Verification URL (if present, look for URLs like credly.com, credential.net, etc.)

Output ONLY valid JSON with this structure:
{{
  "certification_name": "...",
  "provider": "...",
  "credential_id": "...",
  "verification_url": "..."
}}

Certificate Text:
{text}
"""
        
        llm_response = await llm_generate(prompt, max_tokens_override=1024)
        cert_data = json.loads(llm_response)
        
        # Auto-verify if URL matches known providers
        if cert_data.get('verification_url'):
            url = cert_data['verification_url']
            if re.search(r'(aws\.amazon\.com|coursera\.org|udemy\.com|edx\.org|google\.com|microsoft\.com|cisco\.com|comptia\.org|credly\.com|credential\.net)', url, re.IGNORECASE):
                cert_data['auto_verified'] = True
            else:
                cert_data['auto_verified'] = False
        
        return cert_data
        
    except Exception as e:
        print(f"❌ Error verifying certificate: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing certificate: {str(e)}")

# ==========================================
# CAREER RECOMMENDATION ENDPOINTS
# ==========================================

class SkillsRequest(BaseModel):
    extracted_skills: List[Dict[str, Any]]

@app.post("/api/recommendations")
async def get_recommendations(skills_request: SkillsRequest):
    try:
        recommendations = get_career_recommendations(
            skills_request.extracted_skills,
            top_n=5
        )
        return {
            "status": "success",
            "total_recommendations": len(recommendations),
            "recommendations": recommendations
        }
    except Exception as e:
        print(f"❌ Recommendation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")

@app.get("/api/career-paths")
async def get_all_career_paths():
    from recommendation_engine import CAREER_PATHS
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
    return {"status": "success", "career_paths": career_list}

@app.post("/api/skill-gap-analysis")
async def skill_gap_analysis(skills_request: SkillsRequest, career_id: str):
    try:
        analysis = get_skill_gap_analysis(
            skills_request.extracted_skills,
            career_id
        )
        if not analysis:
            raise HTTPException(status_code=404, detail="Career path not found")
        return {"status": "success", "analysis": analysis}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Skill Gap Analysis Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error analyzing skill gap: {str(e)}")

@app.get("/debug-env")
def debug_env():
    url = os.getenv("GROQ_API_KEY", "NOT SET")
    return {
        "key_length": len(url),
        "key_set": url != "NOT SET"
    }

# ==========================================
# 4. AI LOGIC (Optimized for Comprehensive Extraction)
# ==========================================

async def extract_skills_with_llm(text: str) -> dict:
    full_text = text
    prompt = f"""
You are an expert technical recruiter and resume parser. Your SOLE objective is to perform a COMPREHENSIVE, granular extraction of EVERY skill, tool, technology, and qualification from the provided resume text.

CRITICAL EXTRACTION RULES:
1. BE EXHAUSTIVE: Extract EVERY single skill mentioned. Do not summarize or group them (e.g., extract "Python", "Pandas", "SQL" separately, not just "Data Science").
2. SCAN SECTION BY SECTION: Actively look for skills in: Professional Summary, Work Experience, Education, Certifications, Projects, and the dedicated Skills section.
3. BE SPECIFIC: Include specific software versions, methodologies, frameworks, and domain knowledge (e.g., "AutoCAD", "HSE Compliance", "MV Power Distribution").
4. OUTPUT FORMAT: You MUST output ONLY a valid JSON object. No markdown, no conversational text.

Use these categories:
- Programming Language
- Framework/Library
- Tool/Software
- Domain Knowledge
- Methodology/Standard
- Soft Skill
- Certification

Required JSON Structure:
{{
  "skills": [
    {{"name": "Python", "category": "Programming Language", "confidence": 0.95}},
    {{"name": "Power Distribution", "category": "Domain Knowledge", "confidence": 0.90}}
  ],
  "explanations": [
    {{"skill": "Python", "reasoning": "Listed under Data Analytics skills", "evidence": "Data Analytics: Python, SQL, Power BI"}}
  ]
}}

Resume Text to Analyze:
{full_text}
"""
    try:
        llm_response = await llm_generate(prompt, max_tokens_override=4096)
        skills_data = json.loads(llm_response)
        print(f"✅ Successfully parsed {len(skills_data.get('skills', []))} skills")
        return skills_data
    except json.JSONDecodeError as e:
        print(f"❌ JSON Decode Error: {str(e)}")
        return {"skills": [], "explanations": [], "recommendations": []}
    except Exception as e:
        print(f"❌ LLM Processing Error: {str(e)}")
        return {"skills": [], "explanations": [], "recommendations": []}

# ==========================================
# NEW: CAREER REPORT GENERATION ENDPOINT
# ==========================================

class ReportRequest(BaseModel):
    skills: List[str]

@app.post("/api/generate-career-advice")
async def generate_career_advice(request: ReportRequest):
    """
    Generates a comprehensive career report including SWOT analysis and roadmap.
    """
    try:
        skills_text = ", ".join(request.skills) if request.skills else "No skills provided"

        prompt = f"""
You are an expert Career Coach and Talent Analyst. Based on the following user skills:
[{skills_text}]

Generate a comprehensive career report in STRICT JSON format. Do not include any markdown or text outside the JSON.

Required JSON Structure:
{{
  "executive_summary": "A professional 2-3 sentence summary of this candidate's profile.",
  "swot_analysis": {{
    "strengths": ["Strength 1", "Strength 2"],
    "weaknesses": ["Weakness 1", "Weakness 2"],
    "opportunities": ["Opportunity 1", "Opportunity 2"],
    "threats": ["Threat 1", "Threat 2"]
  }},
  "action_plan": {{
    "30_days": "Specific actionable goal for the next 30 days.",
    "60_days": "Specific actionable goal for the next 60 days.",
    "90_days": "Specific actionable goal for the next 90 days."
  }},
  "recommended_next_skills": ["Skill 1 to learn next", "Skill 2 to learn next"]
}}
"""
        llm_response = await llm_generate(prompt, max_tokens_override=2048)
        advice_data = json.loads(llm_response)
        
        return {"status": "success", "advice": advice_data}

    except Exception as e:
        print(f"❌ Advice Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating advice: {str(e)}")