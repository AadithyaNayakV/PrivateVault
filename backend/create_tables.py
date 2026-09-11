"""Creates all tables in Postgres from the SQLAlchemy models (prototype approach).

Usage: python create_tables.py
"""
from app.database import Base, engine
from app import models  # noqa: F401  (import so models register on Base.metadata)

if __name__ == "__main__":
    Base.metadata.create_all(engine)
    print("Tables created.")
