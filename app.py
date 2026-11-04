from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import requests
import json
import os
from duckduckgo_search import DDGS
from google.antigravity import Agent, LiteRTAgentConfig

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def home():
    with open("static/index.html", "r") as f:
        return HTMLResponse(content=f.read())

@app.get("/models")
def get_models():
    models = []

    # Ollama models
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=5)
        res.raise_for_status()
        models += [m["name"] for m in res.json().get("models", [])]
    except Exception:
        models += ["llama3", "qwen3.5:35b-a3b"]

    # Local LiteRT/Antigravity models
    litert_dir = os.path.expanduser("~/.litert-lm/models")
    if os.path.isdir(litert_dir):
        for entry in os.listdir(litert_dir):
            model_file = os.path.join(litert_dir, entry, "model.litertlm")
            if os.path.isfile(model_file):
                models.append(f"litert:{entry}")

    return {"models": models}

@app.post("/chat")
async def chat(request: Request):
    data = await request.json()
    user_prompt = data.get("prompt", "")
    model_name = data.get("model", "llama3")
    use_web_search = data.get("web_search", False)

    prompt = user_prompt

    if use_web_search:
        try:
            results = DDGS().text(user_prompt, max_results=3)
            if results:
                web_context = "\n\n".join([f"- {r['title']}: {r['body']}" for r in results])
                prompt = f"Use the following recent web search results to accurately answer the user's question. Synthesize the info naturally.\n\nWeb Results:\n{web_context}\n\nUser Question: {user_prompt}"
        except Exception:
            pass

    # Route litert:* models through the local Antigravity/LiteRT agent
    if model_name.startswith("litert:"):
        litert_model_name = model_name[len("litert:"):]
        model_path = os.path.expanduser(f"~/.litert-lm/models/{litert_model_name}/model.litertlm")

        async def generate_litert():
            try:
                config = LiteRTAgentConfig(
                    model_path=model_path,
                    backend="gpu",
                    system_instructions="You are a helpful AI assistant."
                )
                async with Agent(config) as agent:
                    response = await agent.chat(prompt)
                    text = await response.text()
                    yield json.dumps({"response": text}).encode("utf-8") + b"\n"
            except Exception as e:
                yield json.dumps({"response": f"\n\n**Error:** {str(e)}"}).encode("utf-8") + b"\n"

        return StreamingResponse(generate_litert(), media_type="application/x-ndjson")

    # Ollama models
    def generate():
        try:
            res = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": True
                },
                stream=True
            )
            res.raise_for_status()

            for line in res.iter_lines():
                if line:
                    yield line + b"\n"

        except Exception as e:
            error_msg = json.dumps({
                "response": f"\n\n**Error:** Could not communicate with Ollama. Details: {str(e)}"
            })
            yield error_msg.encode('utf-8') + b"\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
