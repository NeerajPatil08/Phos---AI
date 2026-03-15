import os
import sys
from lxml import etree
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

# DrugBank XML Namespace
NS = "{http://www.drugbank.ca}"

# Neo4j Config
URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
USER = os.environ.get("NEO4J_USER", "neo4j")
PASSWORD = os.environ.get("NEO4J_PASSWORD", "password123")

def push_batch(session, drugs, interactions):
    """
    Pushes a batch using an existing session.
    """
    try:
        # 1. Merge Drugs
        if drugs:
            query_drugs = """
            UNWIND $batch AS drug
            MERGE (d:Drug {id: drug.id})
            ON CREATE SET d.name = drug.name
            """
            session.run(query_drugs, batch=drugs)

        # 2. Merge Interactions
        if interactions:
            query_rels = """
            UNWIND $batch AS rel
            MATCH (a:Drug {id: rel.source}), (b:Drug {id: rel.target})
            MERGE (a)-[r:INTERACTS_WITH]->(b)
            SET r.description = rel.description
            """
            session.run(query_rels, batch=interactions)
    except Exception as e:
        print(f"  Batch Push Error: {e}")

def ingest_drugbank(xml_path):
    """
    Streams the DrugBank XML file and ingests data into Neo4j.
    Uses one persistent session with transaction batches.
    """
    if not os.path.exists(xml_path):
        print(f"Error: {xml_path} not found.")
        return

    print(f"Starting ingestion from {xml_path}...")
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    
    try:
        # 1. Setup Constraints
        with driver.session() as session:
            print("Ensuring unique constraints...")
            try:
                session.run("CREATE CONSTRAINT drug_id_unique IF NOT EXISTS FOR (d:Drug) REQUIRE d.id IS UNIQUE")
            except Exception as schema_e:
                print(f"  Note: Constraint check/creation message: {schema_e}")
        
        # 2. Process XML
        context = etree.iterparse(xml_path, events=("end",), tag=f"{NS}drug")
        
        current_drugs = []
        current_interactions = []
        count = 0
        total_rels = 0
        
        # Keep one session open for the entire process
        with driver.session() as session:
            print("Processing drugs...")
            for event, elem in context:
                # Extract drug info...
                drug_id = None
                for i in elem.findall(f"{NS}drugbank-id"):
                    if i.get("primary") == "true":
                        drug_id = i.text
                        break
                
                name_node = elem.find(f"{NS}name")
                name = name_node.text if name_node is not None else "Unknown"
                
                if drug_id:
                    current_drugs.append({"id": drug_id, "name": name})
                    
                    interactions = elem.find(f"{NS}drug-interactions")
                    if interactions is not None:
                        for itx in interactions.findall(f"{NS}drug-interaction"):
                            target_id = itx.find(f"{NS}drugbank-id")
                            desc = itx.find(f"{NS}description")
                            if target_id is not None:
                                current_interactions.append({
                                    "source": drug_id, 
                                    "target": target_id.text,
                                    "description": desc.text if desc is not None else ""
                                })
                                total_rels += 1
                
                # Batch trigger
                if len(current_drugs) >= 250 or len(current_interactions) >= 1500:
                    push_batch(session, current_drugs, current_interactions)
                    current_drugs = []
                    current_interactions = []
                    
                count += 1
                if count % 100 == 0:
                    print(f"Parsed {count} drugs... ({total_rels} interactions)")
                
                elem.clear()
                while elem.getprevious() is not None:
                    del elem.getparent()[0]
            
            # Final batch
            if current_drugs or current_interactions:
                push_batch(session, current_drugs, current_interactions)
                
        print(f"SUCCESS: {count} drugs, {total_rels} interactions.")
        
    except Exception as e:
        print(f"Fatal error: {e}")
    finally:
        driver.close()

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("..", "full_database.xml")
    ingest_drugbank(path)

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("..", "full database.xml")
    ingest_drugbank(path)
