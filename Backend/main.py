"""
DocMind Backend — Fixed HF Router with correct provider suffix
Run: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx, fitz, tempfile, os, asyncio
from dotenv import load_dotenv
import os

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────

# ── API endpoints ─────────────────────────────────────────────────────────────
# Chat: /v1/chat/completions with model:provider suffix (NOT :auto — use real provider)
CHAT_URL   = "https://router.huggingface.co/v1/chat/completions"
CHAT_MODEL = "meta-llama/Llama-3.1-8B-Instruct:cerebras"   # cerebras = fast & free

# Fallback chat models if cerebras fails (try in order)
CHAT_FALLBACKS = [
    "meta-llama/Llama-3.1-8B-Instruct:groq",
    "meta-llama/Llama-3.1-8B-Instruct:together",
    "meta-llama/Llama-3.1-8B-Instruct:fireworks-ai",
    "meta-llama/Llama-3.2-3B-Instruct:cerebras",
]

# QA + Vision still use hf-inference (small models, no provider suffix needed)
QA_URL     = "https://router.huggingface.co/hf-inference/models/deepset/roberta-base-squad2"
VISION_URL = "https://router.huggingface.co/hf-inference/models/Salesforce/blip-image-captioning-large"

JSON_HEADERS = {
    "Authorization": f"Bearer {HF_TOKEN}",
    "Content-Type": "application/json",
}

# ── PDF helpers ───────────────────────────────────────────────────────────────
def extract_pdf_text(data: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        doc  = fitz.open(path)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text.strip()
    finally:
        os.unlink(path)

def chunk_text(text: str, size=3500, overlap=200):
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i : i + size])
        i += size - overlap
    return chunks

# ── Chat helper — tries primary model then fallbacks ─────────────────────────
async def call_chat(client: httpx.AsyncClient, system: str, user: str) -> str:
    models_to_try = [CHAT_MODEL] + CHAT_FALLBACKS
    last_error = ""

    for model in models_to_try:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            "max_tokens": 512,
            "temperature": 0.4,
            "stream": False,
        }
        try:
            r = await client.post(CHAT_URL, headers=JSON_HEADERS, json=payload, timeout=60)

            # Empty response — model loading
            if len(r.content) == 0:
                await asyncio.sleep(10)
                continue

            # Try to parse JSON
            try:
                data = r.json()
            except Exception:
                last_error = f"Non-JSON response from {model}: {r.text[:150]}"
                continue

            # 503 = overloaded, try next
            if r.status_code == 503:
                last_error = f"{model} overloaded"
                continue

            # 404 = model not found on this provider
            if r.status_code == 404:
                last_error = f"{model} not found"
                continue

            if not r.is_success:
                err = data.get("error", {})
                msg = err.get("message", str(data)) if isinstance(err, dict) else str(err)
                last_error = f"{model} error {r.status_code}: {msg}"
                continue

            # Success — parse OpenAI-compatible response
            return data["choices"][0]["message"]["content"].strip()

        except httpx.TimeoutException:
            last_error = f"{model} timed out"
            continue
        except Exception as e:
            last_error = f"{model} exception: {str(e)}"
            continue

    raise ValueError(f"All models failed. Last error: {last_error}")


# ── QA helper ─────────────────────────────────────────────────────────────────
async def call_qa(client: httpx.AsyncClient, question: str, context: str) -> dict:
    for attempt in range(3):
        r = await client.post(
            QA_URL,
            headers=JSON_HEADERS,
            json={"inputs": {"question": question, "context": context}},
            timeout=45,
        )
        if len(r.content) == 0 or r.status_code == 503:
            await asyncio.sleep(15)
            continue
        if not r.is_success:
            raise ValueError(f"QA error {r.status_code}: {r.text[:200]}")
        return r.json()
    raise ValueError("QA model timed out.")


# ── Vision helper ─────────────────────────────────────────────────────────────
async def call_vision(client: httpx.AsyncClient, image_bytes: bytes, mime: str) -> str:
    headers = {"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": mime}
    for attempt in range(3):
        r = await client.post(VISION_URL, headers=headers, content=image_bytes, timeout=45)
        if len(r.content) == 0 or r.status_code == 503:
            await asyncio.sleep(15)
            continue
        if not r.is_success:
            raise ValueError(f"Vision error {r.status_code}: {r.text[:200]}")
        data = r.json()
        if isinstance(data, list) and data:
            return data[0].get("generated_text", "")
        return data.get("generated_text", "an image")
    raise ValueError("Vision model timed out.")


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ask")
async def ask(
    file:     UploadFile = File(...),
    question: str        = Form(...),
):
    raw  = await file.read()
    mime = file.content_type or ""

    async with httpx.AsyncClient() as client:

        # ── IMAGE ─────────────────────────────────────────────────────────
        if mime.startswith("image/"):
            try:
                caption = await call_vision(client, raw, mime)
            except Exception:
                caption = "an uploaded image"

            answer = await call_chat(
                client,
                system="You are a helpful image analyst. Answer questions about images clearly and in detail.",
                user=f'The image shows: "{caption}"\n\nQuestion: {question}\n\nAnswer helpfully and in detail.',
            )
            return {"answer": answer}

        # ── PDF ───────────────────────────────────────────────────────────
        elif mime == "application/pdf":
            try:
                doc_text = extract_pdf_text(raw)
            except Exception as e:
                return JSONResponse({"error": f"PDF read error: {e}"}, status_code=400)

            if not doc_text or len(doc_text) < 50:
                return JSONResponse(
                    {"error": "No text found. PDF may be a scanned image-only file."},
                    status_code=400,
                )

            # Step 1 — extractive QA to find best snippet
            chunks     = chunk_text(doc_text)
            best_ans   = ""
            best_score = -1.0

            for chunk in chunks[:6]:
                try:
                    res   = await call_qa(client, question, chunk)
                    score = res.get("score", 0)
                    if score > best_score:
                        best_score = score
                        best_ans   = res.get("answer", "")
                except Exception:
                    continue

            # Step 2 — chat model gives full answer
            context_snippet = doc_text[:4000]

            if best_ans and best_score > 0.05:
                user_msg = (
                    f"A document Q&A system found this snippet: '{best_ans}' "
                    f"for the question: '{question}'.\n\n"
                    f"Using the document below, give a complete and clear answer:\n\n{context_snippet}"
                )
            else:
                user_msg = (
                    f"Read this document and answer the question.\n\n"
                    f"Document:\n{context_snippet}\n\n"
                    f"Question: {question}\n\n"
                    f"Answer clearly and accurately. If not in the document, say so."
                )

            answer = await call_chat(
                client,
                system="You are an expert document analyst. Answer questions about documents precisely. Use bullet points where helpful.",
                user=user_msg,
            )
            return {"answer": answer}

        else:
            return JSONResponse({"error": "Unsupported file type."}, status_code=400)