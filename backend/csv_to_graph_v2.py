import pandas as pd
import json
import os

def parse_drug_interactions(csv_path, output_json_path):
    print(f"Reading CSV from {csv_path}...")
    # Read the CSV file
    df = pd.read_csv(csv_path)
    
    # Rename columns to match our processing if necessary, or just use them
    # Columns: Drug 1, Drug 2, Interaction Description
    
    print("Extracting unique drugs...")
    # Collect all unique drugs
    all_drugs = pd.concat([df['Drug 1'], df['Drug 2']]).unique()
    
    nodes = []
    for drug in all_drugs:
        if pd.isna(drug): continue
        nodes.append({
            "id": str(drug),
            "label": "Drug"
        })
    
    print(f"Total Drugs: {len(nodes)}")
    
    print("Extracting interactions...")
    edges = []
    for _, row in df.iterrows():
        if pd.isna(row['Drug 1']) or pd.isna(row['Drug 2']): continue
        edges.append({
            "source": str(row['Drug 1']),
            "target": str(row['Drug 2']),
            "type": "INTERACTS_WITH",
            "description": str(row['Interaction Description'])
        })
    
    print(f"Total Interactions: {len(edges)}")
    
    graph_data = {
        "nodes": nodes,
        "edges": edges
    }
    
    print(f"Saving to {output_json_path}...")
    with open(output_json_path, 'w') as f:
        json.dump(graph_data, f, indent=2)
    
    print("Done!")

if __name__ == "__main__":
    csv_file = r"C:\Users\np080\Downloads\db_drug_interactions.csv"
    script_dir = os.path.dirname(__file__)
    output_file = os.path.join(script_dir, "..", "data", "extracted_graph_v2.json")
    
    if os.path.exists(csv_file):
        parse_drug_interactions(csv_file, output_file)
    else:
        print(f"CSV file not found at {csv_file}")
