import os
import json
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
USER = os.environ.get("NEO4J_USER", "neo4j")
PASSWORD = os.environ.get("NEO4J_PASSWORD", "password123")

def populate_db(driver, data):
    with driver.session() as session:
        # Clear existing data for demo
        print("Clearing existing data...")
        session.run("MATCH (n) DETACH DELETE n")

        # Create nodes in batches
        print("Creating nodes...")
        nodes = data.get("nodes", [])
        # Batch by label to keep it simple but efficient
        labels = set(n.get("label", "Entity") for n in nodes)
        for label in labels:
            label_nodes = [n for n in nodes if n.get("label", "Entity") == label]
            query = f"""
            UNWIND $batch AS node
            MERGE (n:`{label}` {{id: node.id}})
            SET n.name = node.id
            """
            session.run(query, batch=label_nodes)
        
        # Create edges in batches
        print("Creating edges...")
        edges = data.get("edges", [])
        # Group by relationship type
        rel_types = set(e.get("type", "RELATES_TO") for e in edges)
        for rel_type in rel_types:
            type_edges = [e for e in edges if e.get("type", "RELATES_TO") == rel_type]
            clean_type = rel_type.replace(" ", "_").upper()
            
            query = f"""
            UNWIND $batch AS edge
            MATCH (a {{id: edge.source}}), (b {{id: edge.target}})
            MERGE (a)-[r:`{clean_type}`]->(b)
            SET r.description = edge.description
            """
            # Batching to avoid memory issues with 190k edges
            batch_size = 5000
            for i in range(0, len(type_edges), batch_size):
                batch = type_edges[i:i + batch_size]
                session.run(query, batch=batch)
                print(f"  Processed {min(i + batch_size, len(type_edges))} / {len(type_edges)} {clean_type} relationships")
        
        print("Database populated successfully.")

if __name__ == "__main__":
    import sys
    script_dir = os.path.dirname(__file__)
    
    # Allow specifying input file via command line
    if len(sys.argv) > 1:
        json_path = sys.argv[1]
    else:
        json_path = os.path.join(script_dir, "..", "data", "extracted_graph.json")
    
    if not os.path.exists(json_path):
        print(f"File not found: {json_path}")
        exit(1)
        
    print(f"Loading data from {json_path}...")
    with open(json_path, "r") as f:
        graph_data = json.load(f)
        
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    try:
        driver.verify_connectivity()
        populate_db(driver, graph_data)
    except Exception as e:
        print(f"Error connecting to Neo4j or populating data: {e}")
    finally:
        driver.close()
