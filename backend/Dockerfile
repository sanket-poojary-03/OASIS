FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/ /app/backend/
COPY shared/ /app/shared/
WORKDIR /app/backend
# X-Forwarded-For is not trusted by uvicorn (its '*' mode took the client-written leftmost entry): app/clientip.py reads
# the client address from the right of the header, past Render's Cloudflare and internal hops.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
