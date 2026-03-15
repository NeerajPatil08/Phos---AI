from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import os
import json
import base64
import io
from dotenv import load_dotenv
from neo4j import GraphDatabase
from openai import OpenAI
from PIL import Image
try:
    import pytesseract
except ImportError:
    pytesseract = None

load_dotenv()

app = FastAPI(title="Interaction Cascade API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

neo4j_uri = os.environ.get("NEO4J_URI")
neo4j_user = os.environ.get("NEO4J_USER")
neo4j_password = os.environ.get("NEO4J_PASSWORD")
driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))

featherless_client = OpenAI(
    base_url="https://api.featherless.ai/v1",
    api_key=os.environ.get("FEATHERLESS_API_KEY")
)

class DrugQuery(BaseModel):
    drugs: List[str]

class TermQuery(BaseModel):
    term: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Interaction Cascade API is running."}

def find_cascading_paths(drugs: List[str]):
    capitalized_drugs = [d.capitalize() for d in drugs]
    seen = set()
    paths = []

    with driver.session() as session:
        # Pass 1: Radiate outward (enzymes, symptoms, indirect paths)
        q1 = """
        MATCH p = (start)-[*1..3]->(end)
        WHERE start.id IN $drugs
        RETURN [n IN nodes(p) | n.id] AS path, [r IN relationships(p) | type(r)] AS rels
        """
        for record in session.run(q1, drugs=capitalized_drugs):
            key = (tuple(record["path"]), tuple(record["rels"]))
            if key not in seen:
                seen.add(key)
                paths.append({"nodes": record["path"], "relationships": record["rels"]})

        # Pass 2: Direct or indirect inter-drug paths
        if len(capitalized_drugs) >= 2:
            q2 = """
            MATCH p = (a)-[*1..3]->(b)
            WHERE a.id IN $drugs AND b.id IN $drugs AND a.id <> b.id
            RETURN [n IN nodes(p) | n.id] AS path, [r IN relationships(p) | type(r)] AS rels
            """
            for record in session.run(q2, drugs=capitalized_drugs):
                key = (tuple(record["path"]), tuple(record["rels"]))
                if key not in seen:
                    seen.add(key)
                    paths.append({"nodes": record["path"], "relationships": record["rels"]})

    return paths


def generate_assessment(paths: List[dict]):
    if not paths:
        return {
            "safety_score": 1,
            "safety_label": "SAFE",
            "summary": "No cascading interactions were detected for this medication combination.",
            "mechanism": "",
            "recommendations": "Continue standard monitoring."
        }

    prompt = f"""
    You are a clinical pharmacology AI. Analyze these cascading drug interaction paths from a knowledge graph:
    {paths}

    Return EXACTLY a JSON object with NO markdown code blocks. Use this structure:
    {{
      "safety_score": <integer 1, 2, or 3>,
      "safety_label": <"SAFE" | "CAUTION" | "DANGER">,
      "verdict_rationale": "<Clinical reasoning for the assigned tier. Focus on the biological pathway overlap (e.g. 'Inhibits CYP2C9 leading to accumulation')>",
      "summary": "<Brief patient-facing answer. Focus on the practical risk (e.g. 'High risk of stomach bleeding')>",
      "mechanism": "<detailed mechanistic explanation>",
      "recommendations": "<clinical action step>",
      "alternatives": [...]
    }}
    
    SCORING RULES:
    1: SAFE - No significant interaction pathways.
    2: CAUTION - Potential pathway overlap, monitor closely.
    3: DANGER - High risk biological cascade, stop/avoid.

    IMPORTANT: verdict_rationale and summary MUST be different. Summary is for the patient (what), Rationale is for the doctor (why).
    Output ONLY valid JSON.
    """
    try:
        response = featherless_client.chat.completions.create(
            model="Qwen/Qwen2.5-72B-Instruct",
            messages=[
                {"role": "system", "content": "You are a strict 3-tier clinical safety API. You ONLY use scores 1, 2, or 3. You MUST provide a 'verdict_rationale'."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.1
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content[content.find('{'):content.rfind('}')+1]
        data = json.loads(content)
        
        # Normalization: Ensure LLM adheres to 3-tier system
        score = data.get("safety_score", 1)
        if score > 3: score = 3 # Clamp old 4-5 scores to 3 (DANGER)
        data["safety_score"] = max(1, min(3, score))
        
        # Ensure label matches score
        if data["safety_score"] == 1: data["safety_label"] = "SAFE"
        elif data["safety_score"] == 2: data["safety_label"] = "CAUTION"
        elif data["safety_score"] == 3: data["safety_label"] = "DANGER"
        
        if not data.get("verdict_rationale"):
            data["verdict_rationale"] = data.get("summary", "Reasoning based on biological cascade analysis.")
            
        return data
    except Exception as e:
        return {
            "safety_score": 3,
            "safety_label": "DANGER",
            "verdict_rationale": "The analysis engine encountered an internal error during processing.",
            "summary": "Processing failure. Clinical consultation required.",
            "mechanism": f"Error: {str(e)}",
            "recommendations": "Verify interaction safety via Lexicomp or Micromedex."
        }

def fetch_llm_drug_data(drug: str):
    prompt = f"""
    You are a strict pharmacological ontology engine. We need to map the biological pathways of the drug: '{drug}'.
    Return EXACTLY a JSON object with the following structure, with NO markdown formatting or other text.
    Do NOT wrap the JSON in ```json or ``` blocks.
    {{
      "nodes": [
        {{"id": "{drug}", "label": "Drug"}},
        {{"id": "CYP...", "label": "Enzyme"}},
        {{"id": "...", "label": "Symptom"}}
      ],
      "edges": [
        {{"source": "{drug}", "target": "CYP...", "type": "INHIBITS"}},
        {{"source": "CYP...", "target": "{drug}", "type": "METABOLIZES"}},
        {{"source": "{drug}", "target": "...", "type": "CAUSES"}}
      ]
    }}
    IMPORTANT: 
    - Use ONLY the edge types: INHIBITS, INDUCES, METABOLIZES, CAUSES, TREATS, AFFECTS.
    - If you do not have absolute certainty about a drug's specific CYP450 pathway, omit it. 
    - Output ONLY valid JSON, nothing else.
    """
    try:
        response = featherless_client.chat.completions.create(
            model="Qwen/Qwen2.5-72B-Instruct",
            messages=[
                {"role": "system", "content": "You are a raw JSON API. Return ONLY JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
        return json.loads(content)
    except Exception as e:
        print(f"LLM Fallback failed for {drug}: {e}")
        return None

def ingest_drug_data(neo4j_session, data: dict):
    if not data: return
    for node in data.get("nodes", []):
        label = node.get("label", "Entity")
        label = "".join(c for c in label if c.isalnum() or c == '_')
        if not label: label = "Entity"
        node_id = node.get("id")
        if node_id:
            neo4j_session.run(f"MERGE (n:{label} {{id: $id}})", id=node_id)
            
    for edge in data.get("edges", []):
        source = edge.get("source")
        target = edge.get("target")
        rel_type = edge.get("type")
        if source and target and rel_type:
            sanitized_type = "".join(c for c in rel_type if c.isalpha() or c == '_').upper()
            if not sanitized_type: continue
            query = f"""
            MATCH (a {{id: $source}})
            MATCH (b {{id: $target}})
            MERGE (a)-[r:{sanitized_type}]->(b)
            """
            neo4j_session.run(query, source=source, target=target)

def check_and_populate_missing_drugs(drugs: List[str]):
    capitalized_drugs = [d.capitalize() for d in drugs]
    with driver.session() as session:
        result = session.run("MATCH (d:Drug) WHERE d.id IN $drugs RETURN d.id", drugs=capitalized_drugs)
        existing = set(record["d.id"] for record in result)
        missing = set(capitalized_drugs) - existing
        
        for m_drug in missing:
            print(f"Drug {m_drug} missing from Neo4j. Triggering Live AI Fallback...")
            llm_data = fetch_llm_drug_data(m_drug)
            if llm_data:
                ingest_drug_data(session, llm_data)

@app.post("/api/check-interactions")
def check_interactions(query: DrugQuery):
    try:
        check_and_populate_missing_drugs(query.drugs)
        paths = find_cascading_paths(query.drugs)
        assessment = generate_assessment(paths)
        return {
            "status": "success",
            "drugs_analyzed": query.drugs,
            "interactions": paths,
            # Structured assessment fields
            "safety_score":      assessment.get("safety_score", 1),
            "safety_label":      assessment.get("safety_label", "UNKNOWN"),
            "verdict_rationale": assessment.get("verdict_rationale", ""),
            "summary":           assessment.get("summary", ""),
            "mechanism":         assessment.get("mechanism", ""),
            "recommendations":   assessment.get("recommendations", ""),
            "alternatives":      assessment.get("alternatives", []),
            # Legacy field for backward compatibility
            "warning": assessment.get("summary", ""),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/describe-term")
def describe_term(query: TermQuery):
    prompt = f"""
    You are a medical educator. Explain the medical term or drug '{query.term}' in simple, layman's language, but ensure absolute scientific accuracy.
    Keep the explanation extremely concise (1-3 sentences maximum).
    """
    try:
        response = featherless_client.chat.completions.create(
            model="Qwen/Qwen2.5-72B-Instruct",
            messages=[
                {"role": "system", "content": "You are a helpful medical educator. Be concise and accurate."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=150
        )
        return {"term": query.term, "description": response.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ReferralQuery(BaseModel):
    drugs: List[str]
    safety_label: str
    mechanism: str
    specialist_type: str


@app.post("/api/generate-referral")
def generate_referral(query: ReferralQuery):
    prompt = f"""
You are a clinical assistant helping a physician write a specialist referral note.
Write a professional, concise 2-paragraph referral note body based on the following context:

- Patient's current medications: {', '.join(query.drugs)}
- Detected interaction risk level: {query.safety_label}
- Interaction mechanism: {query.mechanism}
- Referring to: {query.specialist_type}

Paragraph 1: Clearly state the reason for referral, citing the specific drug interaction concern.
Paragraph 2: Specify what evaluation or management guidance is being requested from the specialist.

Do NOT include a salutation, subject line, or closing. Output only the two-paragraph body text.
"""
    try:
        response = featherless_client.chat.completions.create(
            model="Qwen/Qwen2.5-72B-Instruct",
            messages=[
                {"role": "system", "content": "You are a precise clinical documentation assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.3
        )
        return {"referral_note": response.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extract-medicine")
async def extract_medicine(file: UploadFile = File(...)):
    debug_info = {}
    try:
        # Read image content
        contents = await file.read()
        
        # 1. Primary Strategy: Vision AI (Llama 3.2 Vision)
        try:
            base64_image = base64.b64encode(contents).decode('utf-8')
            response = featherless_client.chat.completions.create(
                model="Qwen/Qwen3-VL-30B-A3B-Instruct",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all medicine/drug names from this image. Return the result as a raw JSON object with a 'drugs' key containing a list of strings. Example: {'drugs': ['Warfarin', 'Ibuprofen']}. Do not include any other text or markdown formatting."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=200,
                temperature=0.1
            )
            content = response.choices[0].message.content.strip()
            if content.startswith("```"):
                content = content[content.find('{'):content.rfind('}')+1]
            data = json.loads(content)
            if "drugs" in data:
                return data
        except Exception as e:
            debug_info["vision_error"] = str(e)
            print(f"Vision API failed: {e}")
            
        # 2. Fallback Strategy: OCR + LLM
        if pytesseract:
            try:
                img = Image.open(io.BytesIO(contents))
                raw_text = pytesseract.image_to_string(img)
                debug_info["ocr_text"] = raw_text
                
                if raw_text.strip():
                    prompt = f"""
                    Extract specific drug/medicine names from the following raw OCR text. 
                    Return ONLY a JSON object with a 'drugs' key.
                    Text:
                    {raw_text}
                    """
                    response = featherless_client.chat.completions.create(
                        model="Qwen/Qwen2.5-72B-Instruct",
                        messages=[
                            {"role": "system", "content": "You are a medical data extraction assistant. Return ONLY JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=150,
                        temperature=0.1
                    )
                    content = response.choices[0].message.content.strip()
                    if content.startswith("```"):
                        content = content[content.find('{'):content.rfind('}')+1]
                    data = json.loads(content)
                    return data
            except Exception as e:
                debug_info["ocr_error"] = str(e)
                print(f"OCR Fallback failed: {e}")
        else:
            debug_info["pytesseract"] = "Not installed or import failed"
                
        return {"drugs": [], "message": "No drugs could be identified from the image.", "debug": debug_info}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
