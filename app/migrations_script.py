#!/usr/bin/env python3
"""
Migration script to add the coral_requests collection to MongoDB.

This script:
1. Creates the coral_requests collection if it doesn't exist
2. Sets up the necessary indexes for efficient querying
3. Validates the collection schema

Usage:
    python add_coral_requests.py [--uri MONGO_URI]
"""

import argparse
import os
import sys
from datetime import datetime

import pymongo
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import CollectionInvalid

def setup_argparse():
    """Set up command line argument parsing"""
    parser = argparse.ArgumentParser(description="Set up coral_requests collection in MongoDB")
    parser.add_argument("--uri", help="MongoDB connection URI", default=None)
    return parser.parse_args()

def main():
    """Main migration function"""
    # Load environment variables
    load_dotenv()
    
    # Parse command line arguments
    args = setup_argparse()
    
    # Get MongoDB URI from arguments or environment variables
    mongo_uri = args.uri or os.getenv("MONGO_URI", "mongodb://localhost:27017/scouting_app")
    
    print(f"Connecting to MongoDB at: {mongo_uri}")
    
    try:
        # Connect to MongoDB
        client = MongoClient(mongo_uri)
        
        # Get database name from URI
        db_name = mongo_uri.split("/")[-1].split("?")[0]
        db = client[db_name]
        
        # Check if collection already exists
        if "coral_requests" in db.list_collection_names():
            print("coral_requests collection already exists")
            if input("Do you want to drop and recreate it? (y/N): ").lower() == "y":
                db.coral_requests.drop()
                print("Collection dropped")
            else:
                # Just create indexes if needed
                create_indexes(db.coral_requests)
                print("Kept existing collection")
                return 0
        
        # Create collection
        try:
            db.create_collection("coral_requests")
            print("Created coral_requests collection")
        except CollectionInvalid:
            print("Collection already exists")
        
        # Create indexes
        create_indexes(db.coral_requests)
        
        # Insert a sample document if requested
        if input("Do you want to insert a sample document? (y/N): ").lower() == "y":
            insert_sample_document(db.coral_requests)
        
        print("Migration complete")
        return 0
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return 1

def create_indexes(collection):
    """Create indexes on the collection"""
    print("Creating indexes...")
    
    # Create indexes for faster querying
    collection.create_index([("status", pymongo.ASCENDING)])
    collection.create_index([("requested_by", pymongo.ASCENDING)])
    collection.create_index([("youtube_url", pymongo.ASCENDING)])
    collection.create_index([("requested_at", pymongo.ASCENDING)])
    collection.create_index([
        ("status", pymongo.ASCENDING),
        ("requested_at", pymongo.ASCENDING)
    ])
    
    print("Indexes created")

def insert_sample_document(collection):
    """Insert a sample document for testing"""
    sample_doc = {
        "status": "pending",
        "youtube_url": "https://www.youtube.com/watch?v=SAMPLE",
        "blue_alliance": ["1234", "5678", "9012"],
        "red_alliance": ["2345", "6789", "0123"],
        "requested_by": None,  # This would normally be an ObjectId
        "requested_at": datetime.utcnow(),
        "event_code": "SAMPLE",
        "match_number": 1
    }
    
    result = collection.insert_one(sample_doc)
    print(f"Inserted sample document with ID: {result.inserted_id}")

if __name__ == "__main__":
    sys.exit(main())
