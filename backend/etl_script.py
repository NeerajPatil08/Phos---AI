import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Initialize Featherless client
# Adjust the base_url to match Featherless documentation
client = OpenAI(
    base_url="https://api.featherless.ai/v1",
    api_key=os.environ.get("FEATHERLESS_API_KEY", "your-api-key-here")
)

def extract_graph_from_text(text: str):
    prompt = f"""
    You are an expert medical data extraction system.
    Extract entities and relationships from the following medical abstract to build a graph database.

    Identify Nodes:
    - Drugs (e.g., Warfarin, Glipizide, Ibuprofen)
    - Enzymes (e.g., CYP2C9, CYP3A4)
    - Symptoms / Conditions (e.g., Bleeding, Atrial Fibrillation, Myopathy)

    Identify Edges (Relationships):
    - INHIBITS (e.g., Glipizide INHIBITS CYP2C9)
    - METABOLIZES (e.g., CYP2C9 METABOLIZES Warfarin)
    - CAUSES (e.g., Toxic buildup CAUSES Bleeding)
    - TREATS (e.g., Warfarin TREATS Atrial Fibrillation)

    Format the output strictly as JSON with this structure:
    {{
        "nodes": [
            {{"id": "node_name", "label": "Drug" | "Enzyme" | "Symptom"}}
        ],
        "edges": [
            {{"source": "node_from", "target": "node_to", "type": "INHIBITS" | "METABOLIZES" | "CAUSES" | "TREATS"}}
        ]
    }}

    Text:
    {text}
    """

    # Assuming a known compatible model on Featherless
    response = client.chat.completions.create(
        model="llama-3-8b-instruct", # Adjust to available model
        messages=[
            {"role": "system", "content": "You are a JSON-only extraction system."},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )

    result = response.choices[0].message.content
    return json.loads(result)

def process_abstracts():
    input_file = os.path.join(os.path.dirname(__file__), "..", "data", "medical_abstracts.txt")
    output_file = os.path.join(os.path.dirname(__file__), "..", "data", "extracted_graph.json")

    with open(input_file, "r") as f:
        content = f.read()

    # Split by double newline or "Abstract X:" to process them, or send all at once
    # We will send all at once for simplicity, but if the context is too large, split them.
    print("Sending text to Featherless API for extraction...")
    try:
        graph_data = extract_graph_from_text(content)
        with open(output_file, "w") as f:
            json.dump(graph_data, f, indent=2)
        print(f"Successfully extracted graph and saved to {output_file}")
    except Exception as e:
        print(f"Error during extraction: {e}")

if __name__ == "__main__":
    process_abstracts()
