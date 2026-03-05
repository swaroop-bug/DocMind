# 📄 DocMind — AI-Powered Document & Image Q&A

An AI-powered web app that lets you upload a **PDF or image** and ask any question about it — powered by free open-source models via Hugging Face.

![Python](https://img.shields.io/badge/Python-3.10+-blue?style=flat&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?style=flat&logo=fastapi)
![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react)
![HuggingFace](https://img.shields.io/badge/HuggingFace-Inference-yellow?style=flat&logo=huggingface)

---

## ✨ Features

- 📄 Upload a PDF and ask questions about its content
- 🖼️ Upload an image and get AI-powered visual analysis
- 💬 Chat-style interface with full conversation history
- ⚡ Fast inference via Cerebras with automatic provider fallback
- 🔍 Extractive + generative pipeline for accurate PDF answers

---

## 🖥️ Tech Stack

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Frontend | React + Vite                                        |
| Backend  | FastAPI (Python)                                    |
| AI       | Hugging Face Router — Llama 3.1, BLIP, RoBERTa     |

---

## 📁 Project Structure

```
docmind/
├── backend/
│   ├── main.py            # FastAPI backend server
│   └── requirements.txt   # Python dependencies
├── frontend/
│   └── src/
│       └── DocMind.jsx    # Main React component
└── README.md
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- A free [Hugging Face account](https://huggingface.co) with an API token

---

### 1. Clone the Repository

```bash
git clone https://github.com/swaroop-bug/DocMind.git
cd DocMind
```

---

### 2. Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Create a `.env` file inside the `backend/` folder:

```
HF_TOKEN=your_huggingface_token_here
```

> Get your free token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

Start the backend server:

```bash
uvicorn main:app --reload --port 8000
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧠 AI Models Used

| Task                  | Model                                          | Provider  |
|-----------------------|------------------------------------------------|-----------|
| Chat / Text answers   | `meta-llama/Llama-3.1-8B-Instruct`            | Cerebras  |
| PDF extractive Q&A    | `deepset/roberta-base-squad2`                  | HF        |
| Image captioning      | `Salesforce/blip-image-captioning-large`       | HF        |

---

## 🔑 Environment Variables

| Variable   | Description                  | Required |
|------------|------------------------------|----------|
| `HF_TOKEN` | Hugging Face API token       | ✅ Yes   |

⚠️ **Never hardcode your token in source code. Always use `.env` files which are excluded by `.gitignore`.**

---

## 📦 Backend Dependencies

Install all at once:

```bash
pip install -r requirements.txt
```

| Package            | Purpose                        |
|--------------------|--------------------------------|
| `fastapi`          | Web framework                  |
| `uvicorn`          | ASGI server                    |
| `httpx`            | Async HTTP requests to HF API  |
| `pymupdf`          | PDF text extraction            |
| `python-multipart` | File upload handling           |

---

## 🚀 Usage

1. Start the backend (`uvicorn main:app --reload --port 8000`)
2. Start the frontend (`npm run dev`)
3. Open the app and upload a PDF or image
4. Type your question and hit Enter

---

## 📄 License

MIT — free to use and modify.