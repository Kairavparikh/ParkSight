"""
Vector search retriever for ParkSight RAG chatbot.
"""

from typing import List
from pathlib import Path
import pickle
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

DIMENSION = 384
VECTOR_DB_DIR = Path(__file__).parent.parent.parent / "vector_db"
INDEX_PATH = VECTOR_DB_DIR / "faiss_index.bin"
METADATA_PATH = VECTOR_DB_DIR / "metadata.pkl"
_model = None
_index = None
_metadata = None


def get_model():
    """Get or load the embedding model (singleton)."""
    global _model
    if _model is None:
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model


def load_index():
    """Load FAISS index and metadata (singleton)."""
    global _index, _metadata
    if _index is None:
        if not INDEX_PATH.exists():
            raise FileNotFoundError(f"Index not found at {INDEX_PATH}. Run build_knowledge_base.py first.")
        _index = faiss.read_index(str(INDEX_PATH))
        with open(METADATA_PATH, 'rb') as f:
            _metadata = pickle.load(f)
    return _index, _metadata


def retrieve(query: str, top_k: int = 5) -> List[str]:
    """
    Retrieve top-k most relevant documents for a query.

    Args:
        query: User's question or search query
        top_k: Number of results to return

    Returns:
        List of relevant text chunks
    """
    # Load model and index
    model = get_model()
    index, metadata = load_index()

    # Embed query and normalize for cosine similarity
    query_embedding = model.encode(query)
    query_normalized = query_embedding / np.linalg.norm(query_embedding)
    query_normalized = query_normalized.reshape(1, -1).astype('float32')

    # Search FAISS index
    distances, indices = index.search(query_normalized, top_k)

    # Extract text from metadata
    documents = [metadata[idx]['text'] for idx in indices[0]]
    return documents


def health_check() -> bool:
    """Check if vector DB is accessible and has data."""
    try:
        if not INDEX_PATH.exists() or not METADATA_PATH.exists():
            return False
        index, metadata = load_index()
        return index.ntotal > 0 and len(metadata) > 0
    except Exception as e:
        print(f"Health check failed: {e}")
        return False
