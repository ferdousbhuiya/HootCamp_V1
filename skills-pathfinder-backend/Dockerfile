# ============================================================
# Skills Pathfinder Backend
# FastAPI + Tesseract OCR + PDF/DOCX processing
# ============================================================

FROM python:3.11-slim

# ------------------------------------------------------------
# 1. Install system dependencies
# ------------------------------------------------------------
# tesseract-ocr  -> OCR for JPG/JPEG/PNG and scanned PDFs
# poppler-utils  -> PDF to image conversion for scanned PDFs
# fonts-liberation -> useful fonts for PDF/image processing
# ------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------
# 2. Application directory
# ------------------------------------------------------------
WORKDIR /app

# ------------------------------------------------------------
# 3. Install Python dependencies
# ------------------------------------------------------------
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------
# 4. Copy application source
# ------------------------------------------------------------
COPY . .

# ------------------------------------------------------------
# 5. Create non-root application user
# ------------------------------------------------------------
RUN adduser --disabled-password --gecos "" appuser

# Make sure the application directory can be read by appuser
RUN chown -R appuser:appuser /app

USER appuser

# ------------------------------------------------------------
# 6. Environment configuration
# ------------------------------------------------------------
# Tesseract is installed at this location in Debian/Ubuntu images.
ENV TESSERACT_CMD=/usr/bin/tesseract

# Tell pdf2image where Poppler utilities are located.
ENV PATH="/usr/bin:${PATH}"

# Python should write logs immediately.
ENV PYTHONUNBUFFERED=1

# ------------------------------------------------------------
# 7. Expose FastAPI port
# ------------------------------------------------------------
EXPOSE 8000

# ------------------------------------------------------------
# 8. Start FastAPI
# ------------------------------------------------------------
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
