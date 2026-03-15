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
    with open('all_models.txt', 'w') as f:
        for model in models:
            f.write(model.id + "\n")
    print("Saved all models to all_models.txt")
except Exception as e:
    print(f"Error: {e}")
