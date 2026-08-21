# ============================================================
# Skills Pathfinder Backend
# FastAPI + Tesseract OCR + PDF/DOCX processing
# ============================================================

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app
USER appuser

ENV TESSERACT_CMD=/usr/bin/tesseract
ENV PATH="/usr/bin:${PATH}"
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# runtime_server.py loads the generalized open-career API and installs the
# narrow production skill-quality patch before serving requests.
CMD ["uvicorn", "runtime_server:app", "--host", "0.0.0.0", "--port", "8000"]
