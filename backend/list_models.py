from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    base_url="https://api.featherless.ai/v1",
    api_key=os.environ.get("FEATHERLESS_API_KEY")
)

try:
    models = client.models.list()
    # Filter for vision models if possible, or just print names
    for model in models:
        name = model.id.lower()
        if "vision" in name or "vl" in name or "pixtral" in name:
            print(model.id)
except Exception as e:
    print(f"Error: {e}")
