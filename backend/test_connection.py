import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

URI = os.environ.get("NEO4J_URI")
USER = os.environ.get("NEO4J_USER")
PASSWORD = os.environ.get("NEO4J_PASSWORD")

print(f"Testing connection to {URI} as {USER}...")

try:
    driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))
    driver.verify_connectivity()
    print("SUCCESS: Connected to Neo4j!")
    
    with driver.session() as session:
        result = session.run("RETURN 'Connection Verified' AS msg")
        print(f"Query Result: {result.single()['msg']}")
        
    driver.close()
except Exception as e:
    print(f"FAILED: {e}")
    if "ssc" in URI:
        print("Suggestion: Try changing 'neo4j+ssc' to 'neo4j+s' in .env")
