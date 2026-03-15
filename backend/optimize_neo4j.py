from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv()

URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
USER = os.environ.get("NEO4J_USER", "neo4j")
PASSWORD = os.environ.get("NEO4J_PASSWORD", "password123")

def optimize_neo4j():
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    with driver.session() as session:
        print("Creating indexes for performance...")
        try:
            session.run("CREATE INDEX drug_id_index IF NOT EXISTS FOR (d:Drug) ON (d.id)")
            session.run("CREATE INDEX enzyme_id_index IF NOT EXISTS FOR (e:Enzyme) ON (e.id)")
            session.run("CREATE INDEX symptom_id_index IF NOT EXISTS FOR (s:Symptom) ON (s.id)")
            print("Indexes created successfully.")
        except Exception as e:
            print(f"Error creating indexes: {e}")
            
    driver.close()

if __name__ == "__main__":
    optimize_neo4j()
