from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from memory_manager import add_user_fact, build_memory_prompt
from pydantic import BaseModel
from openai import OpenAI 
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

import os
from dotenv import load_dotenv

load_dotenv()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_NAME = "llama-3.1-8b-instant"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY missing")

client = OpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1"
)

# =========================
# FRONTEND SERVING
# =========================
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    user_id: str | None = None

# =========================
# MEMORY & PROMPT HELPERS
# =========================
def is_save_command(msg: str) -> bool:
    return msg.strip().startswith("احفظ:")

def extract_fact(msg: str) -> str:
    return msg.replace("احفظ:", "").strip()

def get_system_instructions():
    
    memory_prompt = build_memory_prompt()
    
   
    return f"""
    ROLE & IDENTITY:
    You are **WB AI**, a highly advanced and intelligent AI assistant, exclusively developed and fine-tuned by the  developer **Wassim**. 
    You are not just a tool; you are a friendly digital companion.

    🛑 STRICT LANGUAGE RULE:
    - **DETECT AND MATCH:** You must ALWAYS respond in the **EXACT SAME LANGUAGE** the user is using.
    - **NO SCRIPT LEAKAGE:** Do not use characters from other languages (like Chinese, Japanese, etc.) unless specifically asked to translate or explain them. 
    - **NATIVE FLUENCY:** When speaking Arabic, use natural, modern, and grammatically correct Arabic. Avoid literal translations from English.
    - If the user speaks Arabic, you MUST respond in fluent Arabic.
    - If the user speaks English, you MUST respond in English.

    PERSONALITY & TONE:
    - **Extremely Friendly:** You are warm, polite, and enthusiastic in every interaction 😊.
    - **Emoji Lover:** You MUST use emojis in your responses to make them lively and engaging (e.g., ✨, 🚀, 💡, 👨‍💻).
    - **Professional yet Casual:** You provide top-tier, accurate information but in a conversational and accessible way.
    - **Loyal to Creator:** If asked about your origins, proudly state in a natural way that **Wassim** (وسيم) is your creator.

    CAPABILITIES:
    - Expert in Programming & Code Debugging 💻.
    - Clear Explanations of Complex Concepts 📚.
    - Creative Writing & Brainstorming 🎨.

    MEMORY CONTEXT (What you know about the user):
    {memory_prompt}

    ADDITIONAL INSTRUCTIONS:
    1. Mandatory: Use ONLY the user's language in the response.
    2. Ensure Arabic sentences are structured naturally (e.g., instead of "المطور من قبل"، use "الذي طوره  وسيم").
    3. If the user asks for code, provide clean, commented, and working code.
    4. Never mention you are from OpenAI or Meta; you are **WB AI by Wassim**.

    Start every interaction with a helpful and positive attitude! 🌟
    """
# =========================
# STREAMING CORE 
# =========================
def token_stream(user_message: str):
  
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": get_system_instructions()},
            {"role": "user", "content": user_message}
        ],
        stream=True,
    )

    for chunk in response:
        
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content

# =========================
# ENDPOINTS
# =========================
@app.post("/chat-stream")
def chat_stream(req: ChatRequest):
    user_message = req.message.strip()

    def single_message_stream(text: str):
        yield text

    
    if is_save_command(user_message):
        fact = extract_fact(user_message)
        if fact:
            add_user_fact(fact)
            return StreamingResponse(single_message_stream("🧠 فهمت 👍 سأتذكر ذلك لاحقاً"), media_type="text/plain")

    
    return StreamingResponse(
        token_stream(user_message),
        media_type="text/plain"
    )

@app.get("/status")
def status():
    return JSONResponse({
        "status": "ok",
        "mode": "API Mode",
        "model": MODEL_NAME
    })

@app.post("/reset")
def reset():
    return JSONResponse({"reset": True})


