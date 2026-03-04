from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

_data_dir = os.environ.get("DATA_DIR")
if _data_dir:
    os.makedirs(_data_dir, exist_ok=True)
    DATABASE_URL = f"sqlite:///{_data_dir}/coproposal.db"
else:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./coproposal.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
