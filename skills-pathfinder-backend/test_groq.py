import os, json
from groq import Groq
os.environ["GROQ_API_KEY"] = os.getenv("GROQ_API_KEY", "")  # load from backend .env — never hardcode
os.environ["GROQ_MODEL"] = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
c = Groq(api_key=os.environ["GROQ_API_KEY"])
prompt = "Extract skills from resume text. Output ONLY valid JSON.\n\nI know Python, SQL and React"
try:
    completion = c.chat.completions.create(
        model=os.environ["GROQ_MODEL"],
        messages=[{"role":"system","content":"JSON generator"},{"role":"user","content":prompt}],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type":"json_object"}
    )
    print("LLM OK:", completion.choices[0].message.content[:300])
except Exception as e:
    import traceback; traceback.print_exc()
